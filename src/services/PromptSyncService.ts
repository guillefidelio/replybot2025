import type { User } from 'firebase/auth';
import { FirestoreService, type LocalPrompt, getDefaultPrompts, normalizePromptKey } from './FirestoreService';
import { PromptMigration } from './PromptMigration';

export interface SyncStatus {
  isSyncing: boolean;
  lastSync: Date | null;
  error: string | null;
  hasUnsavedChanges: boolean;
}

export class PromptSyncService {
  private static syncStatus: SyncStatus = {
    isSyncing: false,
    lastSync: null,
    error: null,
    hasUnsavedChanges: false
  };

  private static listeners: Array<(status: SyncStatus) => void> = [];

  // Subscribe to sync status changes
  static onSyncStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  // Update sync status and notify listeners
  private static updateSyncStatus(updates: Partial<SyncStatus>) {
    this.syncStatus = { ...this.syncStatus, ...updates };
    this.listeners.forEach(listener => listener(this.syncStatus));
  }

  // Get current sync status
  static getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  // Get prompts from Chrome local storage (with migration)
  static async getLocalPrompts(): Promise<LocalPrompt> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['prompts'], async (result) => {
        let prompts = result.prompts || {};
        
        // Migrate old nomenclature if needed
        if (PromptMigration.needsMigration(prompts)) {
          console.log('Migrating local prompts to new nomenclature...');
          prompts = PromptMigration.migratePrompts(prompts);
          
          // Save migrated prompts back to storage
          chrome.storage.local.set({ prompts }, () => {
            console.log('Local prompt migration completed');
            resolve(prompts);
          });
        } else {
          console.log('Retrieved local prompts:', prompts);
          resolve(prompts);
        }
      });
    });
  }

  // Save prompts to Chrome local storage
  static async saveLocalPrompts(prompts: LocalPrompt): Promise<void> {
    return new Promise((resolve, reject) => {
      // Normalize prompt keys for consistency
      const normalizedPrompts: LocalPrompt = {};
      Object.entries(prompts).forEach(([key, value]) => {
        const normalizedKey = normalizePromptKey(key);
        normalizedPrompts[normalizedKey] = value;
      });

      chrome.storage.local.set({ prompts: normalizedPrompts }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving local prompts:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('Saved local prompts:', normalizedPrompts);
          resolve();
        }
      });
    });
  }

  // Clear local prompts (on logout)
  static async clearLocalPrompts(): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(['prompts'], () => {
        if (chrome.runtime.lastError) {
          console.error('Error clearing local prompts:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('Cleared local prompts');
          this.updateSyncStatus({ hasUnsavedChanges: false });
          resolve();
        }
      });
    });
  }

  // Sync prompts on user login
  static async syncOnLogin(user: User): Promise<void> {
    try {
      this.updateSyncStatus({ isSyncing: true, error: null });
      console.log('Starting prompt sync on login for user:', user.uid);

      // Check if user has custom prompts in Firestore
      const hasCustomPrompts = await FirestoreService.hasCustomPrompts(user);
      
      if (hasCustomPrompts) {
        // Download and save to local storage
        console.log('User has custom prompts in cloud, downloading...');
        const cloudPrompts = await FirestoreService.getUserPrompts(user);
        await this.saveLocalPrompts(cloudPrompts);
        console.log('Successfully synced prompts from cloud to local');
      } else {
        // Use default prompts - no need to save to local storage yet
        // User will get defaults, and when they customize, it will sync to cloud
        console.log('No custom prompts found in cloud, using defaults');
      }

      this.updateSyncStatus({ 
        isSyncing: false, 
        lastSync: new Date(),
        hasUnsavedChanges: false,
        error: null 
      });
      
    } catch (error) {
      console.error('Error syncing prompts on login:', error);
      this.updateSyncStatus({ 
        isSyncing: false, 
        error: error instanceof Error ? error.message : 'Sync failed' 
      });
      throw error;
    }
  }

  // Save prompt and sync to cloud
  static async savePrompt(user: User, promptId: string, content: string): Promise<void> {
    try {
      this.updateSyncStatus({ hasUnsavedChanges: true });

      // Save to local storage first (for immediate UI response)
      const localPrompts = await this.getLocalPrompts();
      const normalizedId = normalizePromptKey(promptId);
      localPrompts[normalizedId] = content;
      await this.saveLocalPrompts(localPrompts);

      // Then save to Firestore
      await FirestoreService.savePrompt(user, normalizedId, content);
      
      this.updateSyncStatus({ 
        hasUnsavedChanges: false,
        lastSync: new Date(),
        error: null 
      });

      console.log('Successfully saved and synced prompt:', normalizedId);
    } catch (error) {
      console.error('Error saving prompt:', error);
      this.updateSyncStatus({ 
        error: error instanceof Error ? error.message : 'Failed to save prompt' 
      });
      throw error;
    }
  }

  // Save multiple prompts and sync to cloud
  static async savePrompts(user: User, prompts: LocalPrompt): Promise<void> {
    try {
      this.updateSyncStatus({ isSyncing: true, hasUnsavedChanges: true, error: null });

      // Save to local storage first
      await this.saveLocalPrompts(prompts);

      // Then save to Firestore
      await FirestoreService.savePrompts(user, prompts);
      
      this.updateSyncStatus({ 
        isSyncing: false,
        hasUnsavedChanges: false,
        lastSync: new Date(),
        error: null 
      });

      console.log('Successfully bulk saved and synced prompts');
    } catch (error) {
      console.error('Error bulk saving prompts:', error);
      this.updateSyncStatus({ 
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Failed to save prompts' 
      });
      throw error;
    }
  }

  // Sync from cloud to local (manual refresh)
  static async syncFromCloud(user: User): Promise<void> {
    try {
      this.updateSyncStatus({ isSyncing: true, error: null });

      const cloudPrompts = await FirestoreService.getUserPrompts(user);
      await this.saveLocalPrompts(cloudPrompts);
      
      this.updateSyncStatus({ 
        isSyncing: false,
        lastSync: new Date(),
        hasUnsavedChanges: false,
        error: null 
      });

      console.log('Successfully synced from cloud to local');
    } catch (error) {
      console.error('Error syncing from cloud:', error);
      this.updateSyncStatus({ 
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Failed to sync from cloud' 
      });
      throw error;
    }
  }

  // Final sync attempt on logout
  static async syncOnLogout(user: User): Promise<void> {
    try {
      console.log('Performing final sync on logout...');
      
      // Only sync if there are unsaved changes
      if (this.syncStatus.hasUnsavedChanges) {
        const localPrompts = await this.getLocalPrompts();
        if (Object.keys(localPrompts).length > 0) {
          await FirestoreService.savePrompts(user, localPrompts);
          console.log('Final sync completed on logout');
        }
      }

      // Clear local data
      await this.clearLocalPrompts();
      
      this.updateSyncStatus({ 
        hasUnsavedChanges: false,
        lastSync: new Date(),
        error: null 
      });

    } catch (error) {
      console.error('Error during logout sync:', error);
      // Still clear local data even if sync failed
      await this.clearLocalPrompts();
      this.updateSyncStatus({ 
        error: error instanceof Error ? error.message : 'Final sync failed' 
      });
    }
  }

  // Get effective prompts (local or defaults)
  static async getEffectivePrompts(): Promise<LocalPrompt> {
    const localPrompts = await this.getLocalPrompts();
    
    // If no local prompts, return defaults
    if (Object.keys(localPrompts).length === 0) {
      return getDefaultPrompts();
    }
    
    // Merge with defaults for any missing keys
    const defaults = getDefaultPrompts();
    const merged = { ...defaults, ...localPrompts };
    
    return merged;
  }

  // Check if user is authenticated and has access to custom prompts
  static async canUseCustomPrompts(): Promise<boolean> {
    // This will be called by content script to check if buttons should be active
    return new Promise((resolve) => {
      chrome.storage.local.get(['authUser'], (result) => {
        resolve(!!result.authUser);
      });
    });
  }

  // Mark prompts as having unsaved changes
  static markAsChanged(): void {
    this.updateSyncStatus({ hasUnsavedChanges: true });
  }
} 