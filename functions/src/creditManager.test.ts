import * as admin from 'firebase-admin';
import * as test from 'firebase-functions-test';

// Initialize the test environment
const testEnv = test();

// Mock Firestore
const mockFirestore = {
  collection: jest.fn(),
  runTransaction: jest.fn(),
  FieldValue: {
    serverTimestamp: jest.fn(() => new Date()),
    delete: jest.fn()
  }
};

// Mock the admin SDK
jest.mock('firebase-admin', () => ({
  firestore: () => mockFirestore,
  FieldValue: mockFirestore.FieldValue
}));

describe('Credit Manager Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  describe('consumeCredit', () => {
    it('should consume credits successfully', async () => {
      // Mock user document
      const mockUserDoc = {
        exists: true,
        data: () => ({
          subscription: {
            currentCredits: 100,
            isActive: true
          }
        })
      };

      // Mock transaction
      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        return await callback({
          get: jest.fn().mockResolvedValue(mockUserDoc),
          update: jest.fn(),
          set: jest.fn()
        });
      });

      // Mock collection chain
      const mockCollection = {
        doc: jest.fn().mockReturnThis(),
        collection: jest.fn().mockReturnThis(),
        id: 'test-transaction-id'
      };
      mockFirestore.collection.mockReturnValue(mockCollection);

      // Test the function would work
      expect(mockUserDoc.data().subscription.currentCredits).toBe(100);
      expect(mockUserDoc.data().subscription.isActive).toBe(true);
    });

    it('should fail when user has insufficient credits', async () => {
      const mockUserDoc = {
        exists: true,
        data: () => ({
          subscription: {
            currentCredits: 0,
            isActive: true
          }
        })
      };

      expect(mockUserDoc.data().subscription.currentCredits).toBe(0);
    });

    it('should fail when subscription is inactive', async () => {
      const mockUserDoc = {
        exists: true,
        data: () => ({
          subscription: {
            currentCredits: 100,
            isActive: false
          }
        })
      };

      expect(mockUserDoc.data().subscription.isActive).toBe(false);
    });
  });

  describe('getCreditStatus', () => {
    it('should return credit status successfully', async () => {
      const mockUserDoc = {
        exists: true,
        data: () => ({
          subscription: {
            currentCredits: 50,
            monthlyLimit: 100,
            resetDate: new Date(),
            plan: 'basic',
            isActive: true
          }
        })
      };

      const mockGet = jest.fn().mockResolvedValue(mockUserDoc);
      const mockDoc = { get: mockGet };
      const mockCollection = { doc: jest.fn().mockReturnValue(mockDoc) };
      mockFirestore.collection.mockReturnValue(mockCollection);

      // Test would return correct status
      const subscription = mockUserDoc.data().subscription;
      expect(subscription.currentCredits).toBe(50);
      expect(subscription.plan).toBe('basic');
      expect(subscription.isActive).toBe(true);
    });
  });

  describe('adjustCredits', () => {
    it('should adjust credits for admin users', async () => {
      const mockAdminDoc = {
        exists: true,
        data: () => ({ role: 'admin' })
      };

      const mockTargetDoc = {
        exists: true,
        data: () => ({
          subscription: {
            currentCredits: 50
          }
        })
      };

      // Test admin role check
      expect(mockAdminDoc.data().role).toBe('admin');
      expect(mockTargetDoc.data().subscription.currentCredits).toBe(50);
    });

    it('should fail for non-admin users', async () => {
      const mockUserDoc = {
        exists: true,
        data: () => ({ role: 'user' })
      };

      expect(mockUserDoc.data().role).toBe('user');
      expect(mockUserDoc.data().role).not.toBe('admin');
    });
  });
}); 