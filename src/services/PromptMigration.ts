// Migration service to convert old prompt nomenclature to new format
import type { LocalPrompt } from './FirestoreService';

export class PromptMigration {
  /**
   * Migrate prompts from old nomenclature to new nomenclature
   * Old: X_with_text, X_no_text
   * New: X_text, X_no_text
   */
  static migratePrompts(prompts: LocalPrompt): LocalPrompt {
    const migrated: LocalPrompt = {};
    
    Object.entries(prompts).forEach(([key, value]) => {
      let newKey = key;
      
      // Convert old format to new format
      if (key.includes('_with_text')) {
        newKey = key.replace('_with_text', '_text');
        console.log(`Migrating prompt key: ${key} → ${newKey}`);
      }
      
      migrated[newKey] = value;
    });
    
    return migrated;
  }
  
  /**
   * Check if prompts need migration
   */
  static needsMigration(prompts: LocalPrompt): boolean {
    return Object.keys(prompts).some(key => key.includes('_with_text'));
  }
  
  /**
   * Migrate Chrome storage prompts if needed
   */
  static async migrateStoragePrompts(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['prompts']);
      const currentPrompts = result.prompts || {};
      
      if (this.needsMigration(currentPrompts)) {
        console.log('Migrating stored prompts to new nomenclature...');
        const migratedPrompts = this.migratePrompts(currentPrompts);
        
        await chrome.storage.local.set({ prompts: migratedPrompts });
        console.log('Prompt migration completed successfully');
      }
    } catch (error) {
      console.error('Error during prompt migration:', error);
    }
  }
} 