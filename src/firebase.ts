// Firebase configuration and initialization
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your Firebase configuration
// Replace with your actual Firebase config credentials from the Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyCXpG83TK0AWoDe2OgW2-sKTlUISQ6jf-U",
    authDomain: "replybot25.firebaseapp.com",
    projectId: "replybot25",
    storageBucket: "replybot25.firebasestorage.app",
    messagingSenderId: "772679762955",
    appId: "1:772679762955:web:6d6424ccef545f54e7730e",
    measurementId: "G-GZLSQTC55J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

// Development mode - connect to emulators if needed
// if (process.env.NODE_ENV === 'development') {
//   // Uncomment these lines if you want to use Firebase emulators in development
//   // connectAuthEmulator(auth, 'http://localhost:9099');
//   // connectFirestoreEmulator(db, 'localhost', 8080);
// }

export default app; 