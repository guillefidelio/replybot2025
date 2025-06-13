import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  type Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from 'firebase/auth';

// Firestore prompt structure
export interface FirestorePrompt {
  id: string; // e.g., "5_text", "4_no_text"
  content: string;
  rating: number; // 1-5
  hasText: boolean; // true for "text", false for "no_text"
  createdAt: Timestamp;
  updatedAt: Timestamp;
  version: number; // For future conflict resolution
}

// Local storage prompt structure (what the extension uses)
export interface LocalPrompt {
  [key: string]: string; // e.g., { "5_text": "Thank you for...", "5_no_text": "Thanks!" }
}

// Parse prompt ID to extract rating and text status
function parsePromptId(promptId: string): { rating: number; hasText: boolean } {
  const parts = promptId.split('_');
  const rating = parseInt(parts[0], 10);
  const hasText = parts[1] === 'text'; // Only 'text' means has text, 'no_text' means no text
  
  return { rating, hasText };
}

// Create prompt ID from rating and text status (for future use)
// function createPromptId(rating: number, hasText: boolean): string {
//   return `${rating}_${hasText ? 'text' : 'no_text'}`;
// }

export class FirestoreService {
  private static getUserPromptsCollection(userId: string) {
    return collection(db, 'users', userId, 'prompts');
  }

  private static getUserPromptDoc(userId: string, promptId: string) {
    return doc(db, 'users', userId, 'prompts', promptId);
  }

  // Get all prompts for a user
  static async getUserPrompts(user: User): Promise<LocalPrompt> {
    try {
      const promptsCollection = this.getUserPromptsCollection(user.uid);
      const querySnapshot = await getDocs(query(promptsCollection, orderBy('updatedAt', 'desc')));
      
      const prompts: LocalPrompt = {};
      
      querySnapshot.forEach((doc) => {
        const data = doc.data() as FirestorePrompt;
        prompts[data.id] = data.content;
      });

      console.log('Retrieved prompts from Firestore:', prompts);
      return prompts;
    } catch (error) {
      console.error('Error getting user prompts:', error);
      throw new Error('Failed to retrieve prompts from cloud');
    }
  }

  // Save a single prompt
  static async savePrompt(user: User, promptId: string, content: string): Promise<void> {
    try {
      const { rating, hasText } = parsePromptId(promptId);
      const promptDoc = this.getUserPromptDoc(user.uid, promptId);
      
      const promptData: Omit<FirestorePrompt, 'createdAt'> = {
        id: promptId,
        content,
        rating,
        hasText,
        updatedAt: serverTimestamp() as Timestamp,
        version: 1 // Will be incremented on updates
      };

      // Check if document exists to handle created/updated properly
      const docSnapshot = await getDoc(promptDoc);
      
      if (docSnapshot.exists()) {
        // Update existing prompt
        const currentData = docSnapshot.data() as FirestorePrompt;
        await updateDoc(promptDoc, {
          ...promptData,
          version: (currentData.version || 0) + 1
        });
        console.log('Updated prompt in Firestore:', promptId);
      } else {
        // Create new prompt
        await setDoc(promptDoc, {
          ...promptData,
          createdAt: serverTimestamp() as Timestamp
        });
        console.log('Created new prompt in Firestore:', promptId);
      }
    } catch (error) {
      console.error('Error saving prompt:', error);
      throw new Error(`Failed to save prompt ${promptId} to cloud`);
    }
  }

  // Save multiple prompts (bulk operation)
  static async savePrompts(user: User, prompts: LocalPrompt): Promise<void> {
    try {
      const savePromises = Object.entries(prompts).map(([promptId, content]) => 
        this.savePrompt(user, promptId, content)
      );
      
      await Promise.all(savePromises);
      console.log('Bulk saved prompts to Firestore');
    } catch (error) {
      console.error('Error bulk saving prompts:', error);
      throw new Error('Failed to save prompts to cloud');
    }
  }

  // Delete a prompt
  static async deletePrompt(user: User, promptId: string): Promise<void> {
    try {
      const promptDoc = this.getUserPromptDoc(user.uid, promptId);
      await deleteDoc(promptDoc);
      console.log('Deleted prompt from Firestore:', promptId);
    } catch (error) {
      console.error('Error deleting prompt:', error);
      throw new Error(`Failed to delete prompt ${promptId} from cloud`);
    }
  }

  // Check if user has any custom prompts
  static async hasCustomPrompts(user: User): Promise<boolean> {
    try {
      const promptsCollection = this.getUserPromptsCollection(user.uid);
      const querySnapshot = await getDocs(query(promptsCollection, orderBy('updatedAt', 'desc')));
      
      return !querySnapshot.empty;
    } catch (error) {
      console.error('Error checking for custom prompts:', error);
      return false; // Assume no custom prompts on error
    }
  }

  // Get prompt statistics (optional - for future use)
  static async getPromptStats(user: User): Promise<{ count: number; lastUpdated: Date | null }> {
    try {
      const promptsCollection = this.getUserPromptsCollection(user.uid);
      const querySnapshot = await getDocs(query(promptsCollection, orderBy('updatedAt', 'desc')));
      
      let lastUpdated: Date | null = null;
      if (!querySnapshot.empty) {
        const newestDoc = querySnapshot.docs[0];
        const data = newestDoc.data() as FirestorePrompt;
        lastUpdated = data.updatedAt?.toDate() || null;
      }
      
      return {
        count: querySnapshot.size,
        lastUpdated
      };
    } catch (error) {
      console.error('Error getting prompt stats:', error);
      return { count: 0, lastUpdated: null };
    }
  }
}

// Helper function to normalize prompt keys for consistency
export function normalizePromptKey(key: string): string {
  let normalized = key.trim().toLowerCase();
  
  // Convert legacy keys to modern format
  if (normalized.includes('positiveprompt5withtext')) return '5_text';
  if (normalized.includes('positiveprompt5withouttext')) return '5_no_text';
  if (normalized.includes('positiveprompt4withtext')) return '4_text';
  if (normalized.includes('positiveprompt4withouttext')) return '4_no_text';
  if (normalized.includes('neutralprompt3withtext')) return '3_text';
  if (normalized.includes('neutralprompt3withouttext')) return '3_no_text';
  if (normalized.includes('negativeprompt1_2withtext')) return '2_text';
  if (normalized.includes('negativeprompt1_2withouttext')) return '2_no_text';
  
  // Convert old "with_text" format to new "text" format
  normalized = normalized.replace('_with_text', '_text');
  
  // Ensure proper format
  if (!/^\d+_(text|no_text)$/.test(normalized)) {
    console.warn('Invalid prompt key format:', key, '- Expected format: "5_text" or "5_no_text"');
  }
  
  return normalized;
}

// Get default prompts (fallback when no custom prompts exist)
export function getDefaultPrompts(): LocalPrompt {
  return {
    '5_text': 'Thank you so much for taking the time to share your positive experience! We truly appreciate your feedback and are delighted to hear that you had a great experience with us.',
    '5_no_text': 'Thank you for the 5-star rating! We appreciate your business and hope to see you again soon.',
    '4_text': 'Thank you for your positive feedback! We\'re glad you had a good experience with us. We appreciate your business and look forward to serving you again.',
    '4_no_text': 'Thank you for the 4-star rating! We appreciate your feedback and your business.',
    '3_text': 'Thank you for taking the time to leave a review. We appreciate your feedback and would love to learn more about how we can improve your experience.',
    '3_no_text': 'Thank you for the 3-star rating. We appreciate your feedback and hope to improve your experience next time.',
    '2_text': 'Thank you for sharing your feedback. We take all reviews seriously and would like to address your concerns. Please reach out to us directly so we can work to resolve any issues.',
    '2_no_text': 'Thank you for your feedback. We would love to discuss your experience and see how we can improve. Please contact us directly.'
  };
} 