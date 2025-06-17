// functions/src/auth.ts

import * as functions from 'firebase-functions';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Express middleware to authenticate requests using Firebase ID tokens.
 * Verifies the Authorization header (Bearer token).
 * Attaches the decoded user token to `request.user` if valid.
 *
 * @param {functions.https.Request} request - The Express request object.
 * @param {functions.Response} response - The Express response object.
 * @param {Function} next - The next middleware function in the Express stack.
 */
export const authenticateFirebaseToken = async (
  request: functions.https.Request,
  response: functions.Response,
  next: Function
): Promise<void> => {
  functions.logger.info('Attempting to authenticate Firebase ID token...');

  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    functions.logger.warn('No Firebase ID token was passed as a Bearer token in the Authorization header.', {
      headers: request.headers,
    });
    response.status(403).send('Unauthorized: No Bearer token provided.');
    return;
  }

  const idToken = authorizationHeader.split('Bearer ')[1];

  try {
    const decodedIdToken = await admin.auth().verifyIdToken(idToken);
    functions.logger.info('ID Token correctly decoded', { uid: decodedIdToken.uid });

    // Extend the Request interface if using TypeScript and wanting strong typing for `request.user`
    // For example, create a `types/index.d.ts` in `functions/src` with:
    // declare namespace Express {
    //   export interface Request {
    //     user?: admin.auth.DecodedIdToken;
    //   }
    // }
    // For now, using `any` for broader compatibility or assuming Express.Request might be extended elsewhere.
    (request as any).user = decodedIdToken;
    next();
    return;
  } catch (error) {
    functions.logger.error('Error while verifying Firebase ID token:', error);
    if (error.code === 'auth/id-token-expired') {
      response.status(401).send('Unauthorized: Token expired.');
    } else {
      response.status(403).send('Unauthorized: Invalid token.');
    }
    return;
  }
};

/**
 * Higher-order function to protect an HTTP Cloud Function with Firebase authentication.
 *
 * @param { (request: functions.https.Request, response: functions.Response) => void | Promise<void> } handler
 *        The Cloud Function handler to protect.
 * @returns {functions.HttpsFunction} A new Cloud Function that includes authentication middleware.
 */
export const authenticatedFunction = (
    handler: (request: functions.https.Request, response: functions.Response, user: admin.auth.DecodedIdToken) => void | Promise<void>
): functions.HttpsFunction => {
    return functions.https.onRequest(async (request, response) => {
        const authorizationHeader = request.headers.authorization;

        if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
            functions.logger.warn('No Firebase ID token was passed as a Bearer token in the Authorization header.', {
                headers: request.headers,
            });
            response.status(403).send('Unauthorized: No Bearer token provided.');
            return;
        }

        const idToken = authorizationHeader.split('Bearer ')[1];

        try {
            const decodedIdToken = await admin.auth().verifyIdToken(idToken);
            functions.logger.info('ID Token correctly decoded for authenticatedFunction', { uid: decodedIdToken.uid });
            // Pass the decoded token (user) to the actual handler
            await handler(request, response, decodedIdToken);
        } catch (error) {
            functions.logger.error('Error while verifying Firebase ID token in authenticatedFunction:', error);
            if (error.code === 'auth/id-token-expired') {
                response.status(401).send('Unauthorized: Token expired.');
            } else {
                response.status(403).send('Unauthorized: Invalid token.');
            }
        }
    });
};


// Example usage (for testing purposes, not part of the core auth.ts)
/*
export const myProtectedFunction = authenticatedFunction(async (request, response, user) => {
  functions.logger.info(`Request by authenticated user: ${user.uid}`);
  response.send({ message: `Hello ${user.email || user.uid}, you are authenticated!` });
});
*/

/**
 * Helper to get the UID from a decoded token, typically attached to `request.user`.
 * Throws an error if user is not found on the request, which should not happen if
 * `authenticateFirebaseToken` middleware is used correctly.
 *
 * @param {admin.auth.DecodedIdToken | undefined} user - The decoded ID token (e.g., from `request.user`).
 * @returns {string} The user's UID.
 * @throws {Error} If the user or UID is not available.
 */
export const getUidFromRequest = (user: admin.auth.DecodedIdToken | undefined): string => {
  if (!user || !user.uid) {
    throw new Error('User authentication data not found on request. Ensure authentication middleware is used.');
  }
  return user.uid;
};

// It's also common to initialize admin SDK in a separate firebase-admin-init.ts file
// or directly in the main index.ts of functions if not done elsewhere.
// For this task, placing it here ensures it's initialized when auth.ts is imported.

/**
 * Fetches the UserProfile data from Firestore.
 * @param {string} uid - The user's UID.
 * @returns {Promise<admin.firestore.DocumentData | null>} The user profile data or null if not found.
 */
const getUserProfileFromFirestore = async (uid: string): Promise<admin.firestore.DocumentData | null> => {
  try {
    const userDocRef = admin.firestore().collection('users').doc(uid);
    const userDocSnap = await userDocRef.get();
    if (userDocSnap.exists) {
      return userDocSnap.data() || null;
    }
    functions.logger.warn(`User profile not found in Firestore for UID: ${uid} during role check.`);
    return null;
  } catch (error) {
    functions.logger.error(`Error fetching user profile for UID: ${uid} from Firestore:`, error);
    return null; // Or throw, depending on how critical this is for the caller
  }
};

/**
 * Higher-order function to protect an HTTP Cloud Function, requiring Firebase authentication
 * AND specific user roles. Roles are checked from the user's profile in Firestore.
 *
 * @param {string | string[]} requiredRoles - The role(s) required to access this function.
 *                                            Can be a single role string or an array of roles.
 *                                            If an array, the user must have at least one of the roles.
 * @param { (request: functions.https.Request, response: functions.Response, user: admin.auth.DecodedIdToken, userProfile?: admin.firestore.DocumentData | null) => void | Promise<void> } handler
 *        The Cloud Function handler to protect. Receives the decoded token and user profile.
 * @returns {functions.HttpsFunction} A new Cloud Function that includes authentication and role authorization.
 */
export const authorizedFunction = (
    requiredRoles: string | string[],
    handler: (
        request: functions.https.Request,
        response: functions.Response,
        user: admin.auth.DecodedIdToken,
        userProfile?: admin.firestore.DocumentData | null // Optional: pass profile to handler
    ) => void | Promise<void>
): functions.HttpsFunction => {
    return functions.https.onRequest(async (request, response) => {
        const authorizationHeader = request.headers.authorization;

        if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
            response.status(403).send('Unauthorized: No Bearer token provided.');
            return;
        }
        const idToken = authorizationHeader.split('Bearer ')[1];

        let decodedIdToken: admin.auth.DecodedIdToken;
        try {
            decodedIdToken = await admin.auth().verifyIdToken(idToken);
        } catch (error) {
            functions.logger.error('Error while verifying Firebase ID token in authorizedFunction:', error);
            response.status(401).send(error.code === 'auth/id-token-expired' ? 'Unauthorized: Token expired.' : 'Unauthorized: Invalid token.');
            return;
        }

        // Token is valid, now check roles from Firestore user profile
        const userProfile = await getUserProfileFromFirestore(decodedIdToken.uid);

        if (!userProfile || !userProfile.roles) {
            functions.logger.warn(`User ${decodedIdToken.uid} does not have a profile or roles defined.`);
            response.status(403).send('Forbidden: User profile or roles not found.');
            return;
        }

        const rolesToCheck = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
        const userRoles = userProfile.roles; // e.g., { admin: true, editor: false }

        const hasRequiredRole = rolesToCheck.some(role => userRoles[role] === true);

        if (!hasRequiredRole) {
            functions.logger.warn(`User ${decodedIdToken.uid} lacks required role(s): ${rolesToCheck.join(', ')}. User roles:`, userRoles);
            response.status(403).send('Forbidden: Insufficient permissions.');
            return;
        }

        functions.logger.info(`User ${decodedIdToken.uid} authorized with role(s) for function.`);
        await handler(request, response, decodedIdToken, userProfile);
    });
};

// Example usage (for testing purposes, not part of the core auth.ts)
/*
export const myAdminFunction = authorizedFunction('admin', async (request, response, user, profile) => {
  functions.logger.info(`Request by admin user: ${user.uid}, Profile roles:`, profile?.roles);
  response.send({ message: `Hello Admin ${user.email || user.uid}!` });
});

export const myEditorFunction = authorizedFunction(['admin', 'editor'], async (request, response, user) => {
  functions.logger.info(`Request by editor/admin user: ${user.uid}`);
  response.send({ message: `Hello Editor/Admin ${user.email || user.uid}!` });
});
*/
