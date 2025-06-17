import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const auth = admin.auth();
const db = admin.firestore();

/**
 * Validate authentication from function context
 */
export async function validateAuth(context: functions.https.CallableContext): Promise<string | null> {
  if (!context.auth) {
    return null;
  }

  try {
    // Verify the token is still valid
    // Token is already verified by Firebase Functions
    // await auth.verifyIdToken(context.auth.token);
    return context.auth.uid;
  } catch (error) {
    console.error('Token validation failed:', error);
    return null;
  }
}

/**
 * Check if user has specific role
 */
export async function hasRole(userId: string, requiredRole: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return false;
    }

    const userData = userDoc.data()!;
    const userRole = userData.role || 'user';

    // Define role hierarchy
    const roleHierarchy: { [key: string]: string[] } = {
      'admin': ['admin', 'support', 'user'],
      'support': ['support', 'user'],
      'user': ['user']
    };

    return roleHierarchy[userRole]?.includes(requiredRole) || false;
  } catch (error) {
    console.error('Error checking user role:', error);
    return false;
  }
}

/**
 * Validate admin access
 */
export async function validateAdminAuth(context: functions.https.CallableContext): Promise<string | null> {
  const userId = await validateAuth(context);
  if (!userId) {
    return null;
  }

  const isAdmin = await hasRole(userId, 'admin');
  return isAdmin ? userId : null;
}

/**
 * Validate support access (admin or support role)
 */
export async function validateSupportAuth(context: functions.https.CallableContext): Promise<string | null> {
  const userId = await validateAuth(context);
  if (!userId) {
    return null;
  }

  const hasAccess = await hasRole(userId, 'support');
  return hasAccess ? userId : null;
}

/**
 * Create custom claims for user roles
 */
export async function setUserRole(userId: string, role: string): Promise<void> {
  try {
    await auth.setCustomUserClaims(userId, { role });
    
    // Also update in Firestore for consistency
    await db.collection('users').doc(userId).update({
      role,
      roleUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Error setting user role:', error);
    throw error;
  }
}

/**
 * Refresh user token to include updated claims
 */
export const refreshUserToken = functions.https.onCall(async (data, context) => {
  try {
    const userId = await validateAuth(context);
    if (!userId) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Force token refresh by updating a claim
    const user = await auth.getUser(userId);
    const claims = user.customClaims || {};
    
    await auth.setCustomUserClaims(userId, {
      ...claims,
      refreshed: Date.now()
    });

    return { success: true, message: 'Token refreshed' };
  } catch (error) {
    console.error('Error refreshing token:', error);
    throw new functions.https.HttpsError('internal', 'Failed to refresh token');
  }
});

/**
 * Validate service account access (for internal functions)
 */
export function isServiceAccount(context: functions.https.CallableContext): boolean {
  return context.auth?.uid === undefined && context.rawRequest.headers['x-service-account'] === 'true';
}

/**
 * Rate limit validation based on user tier
 */
export async function getUserRateLimit(userId: string): Promise<{ requests: number; windowMs: number }> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return { requests: 10, windowMs: 60000 }; // Default: 10 requests per minute
    }

    const userData = userDoc.data()!;
    const plan = userData.subscription?.plan || 'free';

    // Define rate limits by plan
    const rateLimits: { [key: string]: { requests: number; windowMs: number } } = {
      'free': { requests: 10, windowMs: 60000 },      // 10/min
      'basic': { requests: 30, windowMs: 60000 },     // 30/min
      'premium': { requests: 100, windowMs: 60000 },  // 100/min
      'enterprise': { requests: 500, windowMs: 60000 } // 500/min
    };

    return rateLimits[plan] || rateLimits['free'];
  } catch (error) {
    console.error('Error getting user rate limit:', error);
    return { requests: 10, windowMs: 60000 };
  }
}

/**
 * Validate request origin and CORS
 */
export function validateOrigin(req: functions.Request): boolean {
  const allowedOrigins = [
    'chrome-extension://',
    'moz-extension://',
    'https://replybot25.firebaseapp.com',
    'https://replybot25.web.app'
  ];

  const origin = req.headers.origin || '';
  const userAgent = req.headers['user-agent'] || '';

  // Allow Chrome extension requests
  if (userAgent.includes('Chrome') && origin.startsWith('chrome-extension://')) {
    return true;
  }

  // Allow Firefox extension requests
  if (userAgent.includes('Firefox') && origin.startsWith('moz-extension://')) {
    return true;
  }

  // Allow web app requests
  return allowedOrigins.some(allowed => 
    allowed.startsWith('https://') && origin === allowed
  );
}

/**
 * Security headers middleware
 */
export function setSecurityHeaders(res: functions.Response): void {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'self'",
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
} 