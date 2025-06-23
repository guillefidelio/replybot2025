// Create a new handshake service that will work in popup context
import { httpsCallable, getFunctions } from 'firebase/functions';
import app from '../firebase';

export class HandshakeService {
  static async performHandshake(user: { uid: string; email: string }): Promise<boolean> {
    try {
      console.log(` Starting handshake for user: ${user.uid}`);
      
      // Call Firebase Function from popup context (where document exists)
      const functions = getFunctions(app);
      const getUserSessionData = httpsCallable(functions, 'getUserSessionData');
      
      console.log(' Calling getUserSessionData function...');
      const result = await getUserSessionData();
      const sessionData = result.data;
      
      console.log(' Handshake successful! Data received:', sessionData);
      
      // Store session data in Chrome storage
      await chrome.storage.local.set({
        sessionData: sessionData,
        handshakeComplete: true,
        lastHandshake: Date.now()
      });
      
      // Notify background script that handshake is complete
      chrome.runtime.sendMessage({
        type: 'HANDSHAKE_COMPLETE',
        data: sessionData
      });
      
      return true;
    } catch (error) {
      console.error(' Handshake failed:', error);
      return false;
    }
  }
}
