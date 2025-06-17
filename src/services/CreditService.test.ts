// src/services/CreditService.test.ts

import { CreditService } from './CreditService';
// import { db } from '../firebase'; // Removed unused db import
import type { UserProfile } from '../types/firebase'; // Changed to type-only
// Removed unused imports:
// import type { CreditTransaction } from '../types/payment';
// import { DEFAULT_FREE_PLAN } from '../types/payment';


// Mock Firestore
jest.mock('../firebase', () => ({
  db: jest.fn(),
}));

const mockGetDoc = jest.fn();
const mockSetDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockAddDoc = jest.fn();
const mockRunTransaction = jest.fn();
const mockOnSnapshot = jest.fn();
const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockServerTimestamp = jest.fn(() => new Date());

jest.mock('firebase/firestore', () => ({
  getDoc: (docRef: any) => mockGetDoc(docRef),
  setDoc: (docRef: any, data: any) => mockSetDoc(docRef, data),
  updateDoc: (docRef: any, data: any) => mockUpdateDoc(docRef, data),
  addDoc: (collRef: any, data: any) => mockAddDoc(collRef, data),
  runTransaction: (db: any, updateFunction: Function) => mockRunTransaction(db, updateFunction), // db still received by mock, but test impl won't use its arg
  onSnapshot: (docRef: any, callback: Function, errorCallback?: Function) => mockOnSnapshot(docRef, callback, errorCallback),
  collection: (db: any, path: string, ...pathSegments: string[]) => mockCollection(db, path, ...pathSegments),
  doc: (db: any, path: string, ...pathSegments: string[]) => mockDoc(db, path, ...pathSegments),
  serverTimestamp: () => mockServerTimestamp(),
  Timestamp: { fromDate: (date: Date) => date },
}));

describe('CreditService', () => {
  let creditService: CreditService;
  const testUserId = 'testUser123';
  const mockUserDocRef = { id: testUserId, path: `users/${testUserId}` };
  const mockTransactionsColRef = { id: 'creditTransactions', path: `users/${testUserId}/creditTransactions` };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockImplementation((dbOrCollRef, path, ...pathSegments) => { // Renamed first param for clarity
      if (typeof path === 'string' && path === 'users' && pathSegments[0] === testUserId) {
        return mockUserDocRef;
      }
      if (typeof dbOrCollRef === 'object' && dbOrCollRef.id === 'creditTransactions' && typeof path === 'undefined') { // Check for call with collectionRef
         return { id: 'newTransactionId', path: `users/${testUserId}/creditTransactions/newTransactionId` };
      }
      return { id: 'unknownPathInMockDoc', path: `unknownPathInMockDoc/${path}`}; // Adjusted fallback
    });

    mockCollection.mockImplementation((parentRefOrDb, pathSegment1, ...furtherPathSegments) => {
      if (typeof parentRefOrDb === 'object' &&
          parentRefOrDb.id === testUserId &&
          pathSegment1 === 'creditTransactions' &&
          furtherPathSegments.length === 0) {
        return mockTransactionsColRef;
      }
      return { id: 'unknownCollection', path: `unknownColl/${pathSegment1}` };
    });
    creditService = CreditService.getInstance();
    creditService.cleanupListeners();
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
      const mockUserData: Partial<UserProfile> = { uid: testUserId, email: 'test@example.com' };
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
    let mockTransactionGet: jest.Mock;
    let mockTransactionUpdate: jest.Mock;
    let mockTransactionSet: jest.Mock;


    it('should successfully consume credits and log transaction', async () => {
      mockTransactionGet = jest.fn().mockResolvedValue({ exists: () => true, data: () => ({ credits: initialCredits, uid: testUserId, email: 'test@example.com' } as UserProfile) });
      mockTransactionUpdate = jest.fn();
      mockTransactionSet = jest.fn();
      // Removed unused 'db' param from callback
      mockRunTransaction.mockImplementation(async (_db, updateFunction) => {
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
        expect.objectContaining({ path: expect.stringContaining(`users/${testUserId}/creditTransactions/`) }),
        expect.objectContaining({
          userId: testUserId,
          type: 'usage',
          amount: -consumeAmount,
          description: 'Test consumption',
          timestamp: expect.any(Date),
        })
      );
    });

    it('should throw error for insufficient credits', async () => {
      // Removed unused 'db' param
      mockRunTransaction.mockImplementation(async (_db, updateFunction) => {
        await updateFunction({
          get: jest.fn().mockResolvedValue({ exists: () => true, data: () => ({ credits: 5 } as UserProfile) }),
          update: jest.fn(),
          set: jest.fn(),
        });
      });

      await expect(creditService.consumeCredits(testUserId, consumeAmount, 'Test consumption')).rejects.toThrow('Insufficient credits.');
    });

    it('should throw error if amount to consume is zero or negative', async () => {
      await expect(creditService.consumeCredits(testUserId, 0, 'Test')).rejects.toThrow('Amount to consume must be positive.');
      await expect(creditService.consumeCredits(testUserId, -5, 'Test')).rejects.toThrow('Amount to consume must be positive.');
    });

    it('should throw error if user document does not exist in transaction', async () => {
        // Removed unused 'db' param
        mockRunTransaction.mockImplementation(async (_db, updateFunction) => {
            await updateFunction({
                get: jest.fn().mockResolvedValue({ exists: () => false }),
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
    let mockTransactionGet: jest.Mock;
    let mockTransactionUpdate: jest.Mock;
    let mockTransactionSet: jest.Mock;

    it('should successfully add credits and log transaction', async () => {
      mockTransactionGet = jest.fn().mockResolvedValue({ exists: () => true, data: () => ({ credits: initialCredits, uid: testUserId, email: 'test@example.com' } as UserProfile) });
      mockTransactionUpdate = jest.fn();
      mockTransactionSet = jest.fn();
      // Removed unused 'db' param
      mockRunTransaction.mockImplementation(async (_db, updateFunction) => {
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
      const mockUserData: Partial<UserProfile> = { uid: testUserId, email: 'test@example.com' };
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
        // Removed unused 'docRef' param
        mockOnSnapshot.mockImplementation((_docRef, cb, errCb) => {
            onSnapshotCallback = cb;
            onSnapshotErrorCallback = errCb;
            return mockUnsubscribe;
        });
    });

    it('should call callback with credits when user data changes', () => {
      const callback = jest.fn();
      creditService.onCreditChange(testUserId, callback);

      expect(mockOnSnapshot).toHaveBeenCalledWith(mockUserDocRef, expect.any(Function), expect.any(Function));

      if (onSnapshotCallback) {
        onSnapshotCallback({ exists: () => true, data: () => ({ credits: 150 } as UserProfile) });
      }
      expect(callback).toHaveBeenCalledWith(150);

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
            onSnapshotCallback({ exists: () => false });
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
      unsubscribe();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it('should allow multiple listeners and cleanupAll should unsubscribe all', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();
        // Removed unused unsubscribe1, unsubscribe2 variables
        creditService.onCreditChange('user1', callback1);
        creditService.onCreditChange('user2', callback2);

        const user1SnapshotCb = mockOnSnapshot.mock.calls[mockOnSnapshot.mock.calls.length - 2][1];
        user1SnapshotCb({ exists: () => true, data: () => ({ credits: 10 }) });
        expect(callback1).toHaveBeenCalledWith(10);

        const user2SnapshotCb = mockOnSnapshot.mock.calls[mockOnSnapshot.mock.calls.length - 1][1];
        user2SnapshotCb({ exists: () => true, data: () => ({ credits: 20 }) });
        expect(callback2).toHaveBeenCalledWith(20);

        creditService.cleanupListeners();
        expect(mockUnsubscribe).toHaveBeenCalledTimes(2);
    });
  });
});
