// src/services/CreditService.test.ts

import { CreditService } from './CreditService';
import { db } from '../firebase'; // Actual db import
import { UserProfile } from '../types/firebase';
import { CreditTransaction, DEFAULT_FREE_PLAN } from '../types/payment';

// Mock Firestore
jest.mock('../firebase', () => ({
  db: jest.fn(), // Mock the db export
}));

// In-depth mock of Firestore functions
const mockGetDoc = jest.fn();
const mockSetDoc = jest.fn(); // Though CreditService primarily uses updateDoc/runTransaction for existing docs
const mockUpdateDoc = jest.fn();
const mockAddDoc = jest.fn();
const mockRunTransaction = jest.fn();
const mockOnSnapshot = jest.fn();
const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockServerTimestamp = jest.fn(() => new Date()); // Return a consistent date for testing

jest.mock('firebase/firestore', () => ({
  getDoc: (docRef: any) => mockGetDoc(docRef),
  setDoc: (docRef: any, data: any) => mockSetDoc(docRef, data),
  updateDoc: (docRef: any, data: any) => mockUpdateDoc(docRef, data),
  addDoc: (collRef: any, data: any) => mockAddDoc(collRef, data),
  runTransaction: (db: any, updateFunction: Function) => mockRunTransaction(db, updateFunction),
  onSnapshot: (docRef: any, callback: Function, errorCallback?: Function) => mockOnSnapshot(docRef, callback, errorCallback),
  collection: (db: any, path: string, ...pathSegments: string[]) => mockCollection(db, path, ...pathSegments),
  doc: (db: any, path: string, ...pathSegments: string[]) => mockDoc(db, path, ...pathSegments),
  serverTimestamp: () => mockServerTimestamp(),
  Timestamp: { fromDate: (date: Date) => date }, // Simple mock for Timestamp
}));

describe('CreditService', () => {
  let creditService: CreditService;
  const testUserId = 'testUser123';
  const mockUserDocRef = { id: testUserId, path: `users/${testUserId}` };
  const mockTransactionsColRef = { id: 'creditTransactions', path: `users/${testUserId}/creditTransactions` };

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Mock doc and collection to return our predefined refs for predictability
    mockDoc.mockImplementation((dbOrCollRef, path, ...pathSegments) => {
      // Case 1: doc(db, 'users', userId)
      if (typeof path === 'string' && path === 'users' && pathSegments[0] === testUserId) {
        return mockUserDocRef;
      }
      // Case 2: doc(collectionRef) -> for creating a new transaction document
      // Here, dbOrCollRef is the collectionRef, and 'path' argument from mock is undefined.
      if (typeof dbOrCollRef === 'object' && dbOrCollRef.id === 'creditTransactions' && typeof path === 'undefined') {
        return { id: 'newTransactionId', path: `users/${testUserId}/creditTransactions/newTransactionId` };
      }
      // Fallback for other unhandled doc calls
      return { id: 'unknownPathInMockDoc', path: `unknownPathInMockDoc/${path}`};
    });

    // mockCollection
    mockCollection.mockImplementation((parentRefOrDb, pathSegment1, ...furtherPathSegments) => {
      // For collection(userDocRef, 'creditTransactions') as used in CreditService
      if (typeof parentRefOrDb === 'object' &&
          parentRefOrDb.id === testUserId && // parentRefOrDb is mockUserDocRef
          pathSegment1 === 'creditTransactions' &&
          furtherPathSegments.length === 0) {
        return mockTransactionsColRef;
      }
      // Fallback for other unhandled collection calls
      return { id: 'unknownCollection', path: `unknownColl/${pathSegment1}` };
    });


    creditService = CreditService.getInstance();
    // Ensure singleton instance is fresh for tests if needed, or manage its state.
    // For simplicity, we rely on getInstance() providing the same, cleanable instance.
    creditService.cleanupListeners(); // Clean up listeners from previous tests
  });

  describe('getUserCredits', () => {
    it('should return user credits if user exists', async () => {
      const mockUserData: UserProfile = {
        uid: testUserId, email: 'test@example.com', credits: 100, activeFeatures: [], createdAt: new Date(), lastLoginAt: new Date()
      };
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => mockUserData });
      const credits = await creditService.getUserCredits(testUserId);
      expect(credits).toBe(100);
      expect(mockGetDoc).toHaveBeenCalledWith(mockUserDocRef);
    });

    it('should return 0 if user exists but has no credits field', async () => {
      const mockUserData: Partial<UserProfile> = { uid: testUserId, email: 'test@example.com' }; // No credits field
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => mockUserData });
      const credits = await creditService.getUserCredits(testUserId);
      expect(credits).toBe(0);
    });

    it('should return null if user does not exist', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      const credits = await creditService.getUserCredits(testUserId);
      expect(credits).toBeNull();
    });

    it('should throw error if Firestore call fails', async () => {
      mockGetDoc.mockRejectedValue(new Error('Firestore error'));
      await expect(creditService.getUserCredits(testUserId)).rejects.toThrow('Firestore error');
    });
  });

  describe('consumeCredits', () => {
    const consumeAmount = 10;
    const initialCredits = 50;
    // Define mockTransaction spies here to be accessible in the test assertions
    let mockTransactionGet: jest.Mock;
    let mockTransactionUpdate: jest.Mock;
    let mockTransactionSet: jest.Mock;


    it('should successfully consume credits and log transaction', async () => {
      mockTransactionGet = jest.fn().mockResolvedValue({ exists: () => true, data: () => ({ credits: initialCredits, uid: testUserId, email: 'test@example.com' } as UserProfile) });
      mockTransactionUpdate = jest.fn();
      mockTransactionSet = jest.fn();

      mockRunTransaction.mockImplementation(async (db, updateFunction) => {
        // The updateFunction will be called with an object that uses the spies defined above
        await updateFunction({
          get: mockTransactionGet,
          update: mockTransactionUpdate,
          set: mockTransactionSet,
        });
        return Promise.resolve();
      });

      await creditService.consumeCredits(testUserId, consumeAmount, 'Test consumption');

      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
      expect(mockTransactionGet).toHaveBeenCalledWith(mockUserDocRef);
      expect(mockTransactionUpdate).toHaveBeenCalledWith(mockUserDocRef, { credits: initialCredits - consumeAmount });
      expect(mockTransactionSet).toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringContaining(`users/${testUserId}/creditTransactions/`) }), // doc(mockTransactionsColRef)
        expect.objectContaining({
          userId: testUserId,
          type: 'usage',
          amount: -consumeAmount,
          description: 'Test consumption',
          timestamp: expect.any(Date), // from serverTimestamp mock
        })
      );
    });

    it('should throw error for insufficient credits', async () => {
      // For this test, we only need to mock the 'get' part of the transaction
      mockRunTransaction.mockImplementation(async (db, updateFunction) => {
        await updateFunction({
          get: jest.fn().mockResolvedValue({ exists: () => true, data: () => ({ credits: 5 } as UserProfile) }), // Not enough credits
          update: jest.fn(),
          set: jest.fn(),
        });
      });

      await expect(creditService.consumeCredits(testUserId, consumeAmount, 'Test consumption')).rejects.toThrow('Insufficient credits.');
    });

    it('should throw error if amount to consume is zero or negative', async () => {
      // No transaction needed for this validation
      await expect(creditService.consumeCredits(testUserId, 0, 'Test')).rejects.toThrow('Amount to consume must be positive.');
      await expect(creditService.consumeCredits(testUserId, -5, 'Test')).rejects.toThrow('Amount to consume must be positive.');
    });

    it('should throw error if user document does not exist in transaction', async () => {
        mockRunTransaction.mockImplementation(async (db, updateFunction) => {
            await updateFunction({
                get: jest.fn().mockResolvedValue({ exists: () => false }), // User does not exist
                update: jest.fn(),
                set: jest.fn(),
            });
        });
        await expect(creditService.consumeCredits(testUserId, consumeAmount, 'Test consumption')).rejects.toThrow(`User not found: ${testUserId}`);
    });
  });

  describe('addCredits', () => {
    const addAmount = 20;
    const initialCredits = 30;
    // Define mockTransaction spies here to be accessible in the test assertions
    let mockTransactionGet: jest.Mock;
    let mockTransactionUpdate: jest.Mock;
    let mockTransactionSet: jest.Mock;

    it('should successfully add credits and log transaction', async () => {
      mockTransactionGet = jest.fn().mockResolvedValue({ exists: () => true, data: () => ({ credits: initialCredits, uid: testUserId, email: 'test@example.com' } as UserProfile) });
      mockTransactionUpdate = jest.fn();
      mockTransactionSet = jest.fn();

      mockRunTransaction.mockImplementation(async (db, updateFunction) => {
        await updateFunction({
          get: mockTransactionGet,
          update: mockTransactionUpdate,
          set: mockTransactionSet,
        });
      });

      await creditService.addCredits(testUserId, addAmount, 'Test purchase', 'purchase');

      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
      expect(mockTransactionGet).toHaveBeenCalledWith(mockUserDocRef);
      expect(mockTransactionUpdate).toHaveBeenCalledWith(mockUserDocRef, { credits: initialCredits + addAmount });
      expect(mockTransactionSet).toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringContaining(`users/${testUserId}/creditTransactions/`) }),
        expect.objectContaining({
          userId: testUserId,
          type: 'purchase',
          amount: addAmount,
          description: 'Test purchase',
          timestamp: expect.any(Date),
        })
      );
    });

    it('should throw error if amount to add is zero or negative', async () => {
      // No transaction needed
      await expect(creditService.addCredits(testUserId, 0, 'Test')).rejects.toThrow('Amount to add must be positive.');
      await expect(creditService.addCredits(testUserId, -5, 'Test')).rejects.toThrow('Amount to add must be positive.');
    });
  });

  describe('hasFeatureAccess', () => {
    it('should return true if user has the feature', async () => {
      const mockUserData: UserProfile = {
        uid: testUserId, email: 'test@example.com', credits: 0, activeFeatures: ['featureA', 'featureB'], createdAt: new Date(), lastLoginAt: new Date()
      };
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => mockUserData });
      const access = await creditService.hasFeatureAccess(testUserId, 'featureA');
      expect(access).toBe(true);
    });

    it('should return false if user does not have the feature', async () => {
      const mockUserData: UserProfile = {
        uid: testUserId, email: 'test@example.com', credits: 0, activeFeatures: ['featureB'], createdAt: new Date(), lastLoginAt: new Date()
      };
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => mockUserData });
      const access = await creditService.hasFeatureAccess(testUserId, 'featureA');
      expect(access).toBe(false);
    });

    it('should return false if user has no activeFeatures array', async () => {
      const mockUserData: Partial<UserProfile> = { uid: testUserId, email: 'test@example.com' }; // No activeFeatures
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => mockUserData });
      const access = await creditService.hasFeatureAccess(testUserId, 'featureA');
      expect(access).toBe(false);
    });

    it('should return false if user does not exist', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      const access = await creditService.hasFeatureAccess(testUserId, 'featureA');
      expect(access).toBe(false);
    });
  });

  describe('onCreditChange', () => {
    let onSnapshotCallback: Function | null = null;
    let onSnapshotErrorCallback: Function | null = null;
    let mockUnsubscribe = jest.fn();

    beforeEach(() => {
        onSnapshotCallback = null;
        onSnapshotErrorCallback = null;
        mockUnsubscribe = jest.fn();
        mockOnSnapshot.mockImplementation((docRef, cb, errCb) => {
            onSnapshotCallback = cb;
            onSnapshotErrorCallback = errCb;
            return mockUnsubscribe; // Return the mock unsubscribe function
        });
    });

    it('should call callback with credits when user data changes', () => {
      const callback = jest.fn();
      creditService.onCreditChange(testUserId, callback);

      expect(mockOnSnapshot).toHaveBeenCalledWith(mockUserDocRef, expect.any(Function), expect.any(Function));

      // Simulate a Firestore update
      if (onSnapshotCallback) {
        onSnapshotCallback({ exists: () => true, data: () => ({ credits: 150 } as UserProfile) });
      }
      expect(callback).toHaveBeenCalledWith(150);

      // Simulate another update
      if (onSnapshotCallback) {
        onSnapshotCallback({ exists: () => true, data: () => ({ credits: 120 } as UserProfile) });
      }
      expect(callback).toHaveBeenCalledWith(120);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should call callback with 0 if user document does not exist in snapshot', () => {
        const callback = jest.fn();
        creditService.onCreditChange(testUserId, callback);
        if (onSnapshotCallback) {
            onSnapshotCallback({ exists: () => false }); // Simulate user doc not existing
        }
        expect(callback).toHaveBeenCalledWith(0);
    });

    it('should log error if onSnapshot emits an error', () => {
        const callback = jest.fn();
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        creditService.onCreditChange(testUserId, callback);

        const testError = new Error("Snapshot error");
        if (onSnapshotErrorCallback) {
            onSnapshotErrorCallback(testError);
        }
        expect(consoleErrorSpy).toHaveBeenCalledWith(`Error listening to credit changes for ${testUserId}:`, testError);
        consoleErrorSpy.mockRestore();
    });

    it('should unsubscribe when returned function is called', () => {
      const unsubscribe = creditService.onCreditChange(testUserId, jest.fn());
      unsubscribe(); // Call the unsubscribe function
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it('should allow multiple listeners and cleanupAll should unsubscribe all', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();
        const unsubscribe1 = creditService.onCreditChange('user1', callback1);
        const unsubscribe2 = creditService.onCreditChange('user2', callback2);

        // Simulate snapshot calls for user1
        const user1SnapshotCb = mockOnSnapshot.mock.calls[mockOnSnapshot.mock.calls.length - 2][1];
        user1SnapshotCb({ exists: () => true, data: () => ({ credits: 10 }) });
        expect(callback1).toHaveBeenCalledWith(10);

        // Simulate snapshot calls for user2
        const user2SnapshotCb = mockOnSnapshot.mock.calls[mockOnSnapshot.mock.calls.length - 1][1];
        user2SnapshotCb({ exists: () => true, data: () => ({ credits: 20 }) });
        expect(callback2).toHaveBeenCalledWith(20);

        creditService.cleanupListeners();
        expect(mockUnsubscribe).toHaveBeenCalledTimes(2); // Assuming mockUnsubscribe is correctly linked for each listener
    });
  });
});
