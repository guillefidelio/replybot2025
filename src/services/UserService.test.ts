// src/services/UserService.test.ts

import { UserService } from './UserService';
import type { FirestoreUserProfile } from './UserService'; // Changed to type-only
// import { db } from '../firebase'; // Removed unused db import
import type { UserProfile } from '../types/firebase'; // Changed to type-only
import { DEFAULT_FREE_PLAN } from '../types/payment';
// import type { SubscriptionPlan } from '../types/payment'; // SubscriptionPlan import removed as it's unused
import type { User } from 'firebase/auth';

// Mock Firestore
jest.mock('../firebase', () => ({
  db: jest.fn(),
}));

const mockGetDoc = jest.fn();
const mockSetDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDoc = jest.fn();
const mockServerTimestamp = jest.fn(() => new Date('2023-01-01T12:00:00.000Z'));

jest.mock('firebase/firestore', () => ({
  getDoc: (docRef: any) => mockGetDoc(docRef),
  setDoc: (docRef: any, data: any) => mockSetDoc(docRef, data),
  updateDoc: (docRef: any, data: any) => mockUpdateDoc(docRef, data),
  doc: (db: any, path: string, ...pathSegments: string[]) => mockDoc(db, path, ...pathSegments),
  serverTimestamp: () => mockServerTimestamp(),
  Timestamp: {
    fromDate: (date: Date) => ({ toDate: () => date, _seconds: date.getTime() / 1000, _nanoseconds: 0 }),
    now: () => ({ toDate: () => new Date(), _seconds: Date.now() / 1000, _nanoseconds: 0 })
  },
}));


describe('UserService', () => {
  const testUserId = 'testUser123';
  const testUserEmail = 'test@example.com';
  const mockUser = { uid: testUserId, email: testUserEmail, displayName: 'Test User' } as User;
  const mockUserDocRef = { id: testUserId, path: `users/${testUserId}` };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockReturnValue(mockUserDocRef);
  });

  describe('createUserDocument', () => {
    it('should create a new user document with default free plan settings if it does not exist', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });

      await UserService.createUserDocument(mockUser);

      expect(mockGetDoc).toHaveBeenCalledWith(mockUserDocRef);
      expect(mockSetDoc).toHaveBeenCalledWith(mockUserDocRef, {
        uid: testUserId,
        email: testUserEmail,
        displayName: 'Test User',
        credits: DEFAULT_FREE_PLAN.credits,
        subscriptionId: DEFAULT_FREE_PLAN.id,
        subscriptionStatus: 'active',
        activeFeatures: DEFAULT_FREE_PLAN.features,
        paddleCustomerId: undefined,
        nextBillingDate: undefined,
        cancellationDate: undefined,
        createdAt: mockServerTimestamp(),
        lastLoginAt: mockServerTimestamp(),
        updatedAt: mockServerTimestamp(),
      });
    });

    it('should not create a document if one already exists', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ email: testUserEmail }) });
      await UserService.createUserDocument(mockUser);
      expect(mockSetDoc).not.toHaveBeenCalled();
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it('should throw an error if Firestore operation fails', async () => {
        mockGetDoc.mockRejectedValue(new Error('Firestore error'));
        await expect(UserService.createUserDocument(mockUser)).rejects.toThrow('Failed to create user profile with payment details');
    });
  });

  describe('getUserProfile', () => {
    it('should return user profile with converted dates if user exists', async () => {
      const serverDate = new Date('2023-10-26T00:00:00.000Z');
      const mockFirestoreData: FirestoreUserProfile = {
        uid: testUserId,
        email: testUserEmail,
        credits: 100,
        activeFeatures: ['test_feature'],
        subscriptionId: 'premium',
        subscriptionStatus: 'active',
        createdAt: { toDate: () => new Date('2023-01-01T12:00:00.000Z'), _seconds: new Date('2023-01-01T12:00:00.000Z').getTime()/1000, _nanoseconds:0 } as any,
        lastLoginAt: { toDate: () => new Date('2023-01-01T12:00:00.000Z'), _seconds: new Date('2023-01-01T12:00:00.000Z').getTime()/1000, _nanoseconds:0 } as any,
        updatedAt: { toDate: () => new Date('2023-01-01T12:00:00.000Z'), _seconds: new Date('2023-01-01T12:00:00.000Z').getTime()/1000, _nanoseconds:0 } as any,
        nextBillingDate: { toDate: () => serverDate, _seconds: serverDate.getTime()/1000, _nanoseconds:0 } as any,
      };
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => mockFirestoreData });

      const profile = await UserService.getUserProfile(testUserId);

      expect(mockGetDoc).toHaveBeenCalledWith(mockUserDocRef);
      expect(profile).toEqual(expect.objectContaining({
        uid: testUserId,
        email: testUserEmail,
        credits: 100,
        activeFeatures: ['test_feature'],
        subscriptionId: 'premium',
        createdAt: new Date('2023-01-01T12:00:00.000Z'),
        lastLoginAt: new Date('2023-01-01T12:00:00.000Z'),
        nextBillingDate: serverDate,
      }));
    });

    it('should return null if user does not exist', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      const profile = await UserService.getUserProfile(testUserId);
      expect(profile).toBeNull();
    });

    it('should return null and log error if Firestore call fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGetDoc.mockRejectedValue(new Error('Firestore error'));
      const profile = await UserService.getUserProfile(testUserId);
      expect(profile).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error getting user profile:', expect.any(Error));
      consoleErrorSpy.mockRestore();
    });
  });

  describe('updateUserSubscription', () => {
    it('should update subscription details and convert dates to Timestamps', async () => {
      const newSubscriptionData: Partial<UserProfile> = {
        subscriptionId: 'premium_monthly',
        subscriptionStatus: 'active',
        activeFeatures: ['premium_feature_1'],
        paddleCustomerId: 'paddle123',
        nextBillingDate: new Date('2023-11-01T00:00:00.000Z'),
      };

      const expectedNextBillingDateTimestamp = {
        toDate: expect.any(Function),
        _seconds: newSubscriptionData.nextBillingDate!.getTime()/1000,
        _nanoseconds: 0
      };
      const expectedFirestoreUpdate = {
        subscriptionId: 'premium_monthly',
        subscriptionStatus: 'active',
        activeFeatures: ['premium_feature_1'],
        paddleCustomerId: 'paddle123',
        nextBillingDate: expect.objectContaining(expectedNextBillingDateTimestamp),
        updatedAt: mockServerTimestamp(),
      };

      await UserService.updateUserSubscription(testUserId, newSubscriptionData);

      expect(mockUpdateDoc).toHaveBeenCalledWith(mockUserDocRef, expect.objectContaining(expectedFirestoreUpdate));
    });

    it('should handle updates without date fields', async () => {
        const newSubscriptionData: Partial<UserProfile> = {
            subscriptionId: 'gold_tier',
            activeFeatures: ['gold_feature'],
        };
        const expectedFirestoreUpdate = {
            ...newSubscriptionData,
            updatedAt: mockServerTimestamp(),
        };
        await UserService.updateUserSubscription(testUserId, newSubscriptionData);
        expect(mockUpdateDoc).toHaveBeenCalledWith(mockUserDocRef, expectedFirestoreUpdate);
    });

    it('should throw an error if Firestore operation fails', async () => {
        mockUpdateDoc.mockRejectedValue(new Error('Firestore error'));
        const newSubscriptionData: Partial<UserProfile> = { subscriptionId: 'basic' };
        await expect(UserService.updateUserSubscription(testUserId, newSubscriptionData))
            .rejects.toThrow('Failed to update user subscription');
    });
  });

  describe('ensureUserDocument', () => {
    it('should call createUserDocument if user does not exist', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      const createUserDocumentSpy = jest.spyOn(UserService, 'createUserDocument');
      createUserDocumentSpy.mockResolvedValueOnce(undefined);

      await UserService.ensureUserDocument(mockUser);

      expect(createUserDocumentSpy).toHaveBeenCalledWith(mockUser);
      createUserDocumentSpy.mockRestore();
    });

    it('should call updateLastLogin if user exists and has credits field', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ credits: 10 }) });
      const updateLastLoginSpy = jest.spyOn(UserService, 'updateLastLogin');
      updateLastLoginSpy.mockResolvedValueOnce(undefined);

      await UserService.ensureUserDocument(mockUser);

      expect(updateLastLoginSpy).toHaveBeenCalledWith(mockUser);
      expect(mockUpdateDoc).not.toHaveBeenCalledWith(mockUserDocRef, expect.objectContaining({ credits: DEFAULT_FREE_PLAN.credits }));
      updateLastLoginSpy.mockRestore();
    });

    it('should add default payment fields if user exists but lacks them', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ email: testUserEmail }) });
      const updateLastLoginSpy = jest.spyOn(UserService, 'updateLastLogin').mockResolvedValueOnce(undefined);

      await UserService.ensureUserDocument(mockUser);

      expect(updateLastLoginSpy).toHaveBeenCalledWith(mockUser);
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        mockUserDocRef,
        expect.objectContaining({
          credits: DEFAULT_FREE_PLAN.credits,
          subscriptionId: DEFAULT_FREE_PLAN.id,
          subscriptionStatus: 'active',
          activeFeatures: DEFAULT_FREE_PLAN.features,
          updatedAt: mockServerTimestamp(),
        })
      );
      updateLastLoginSpy.mockRestore();
    });

    it('should log error and not throw if ensureUserDocument has an internal error', async () => {
        mockGetDoc.mockRejectedValue(new Error('Internal Firestore error'));
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await expect(UserService.ensureUserDocument(mockUser)).resolves.not.toThrow();
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error ensuring user document:', expect.any(Error));

        consoleErrorSpy.mockRestore();
    });
  });
});
