import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, signOut, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAxhkdZEG6Q9FU6uL8CtC5FdEzPTdC9ljs",
  authDomain: "fitcheckai-a72ff.firebaseapp.com",
  projectId: "fitcheckai-a72ff",
  storageBucket: "fitcheckai-a72ff.firebasestorage.app",
  messagingSenderId: "327759514287",
  appId: "1:327759514287:web:d9eb555a962e07cc76625a",
  measurementId: "G-4MC5EFE0D2"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

/* ───────── Phone Auth ───────── */
export function setupRecaptcha(elementId) {
  if (!window.recaptchaVerifier) {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, elementId, {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => { window.recaptchaVerifier = null; }
    });
  }
  return window.recaptchaVerifier;
}

export async function sendPhoneOTP(phoneNumber) {
  const recaptcha = setupRecaptcha('recaptcha-container');
  const confirmation = await signInWithPhoneNumber(auth, phoneNumber, recaptcha);
  return confirmation; // caller stores this to call .confirm(otp) later
}

export async function verifyPhoneOTP(confirmationResult, otp) {
  const result = await confirmationResult.confirm(otp);
  return result.user;
}

/* ───────── Email Auth ───────── */
export async function signUpWithEmail(email, password) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(userCredential.user);
  return userCredential.user;
}

export async function signInEmail(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

export async function resendVerificationEmail() {
  if (auth.currentUser && !auth.currentUser.emailVerified) {
    await sendEmailVerification(auth.currentUser);
  }
}

/* ───────── General ───────── */
export async function logOut() {
  window.recaptchaVerifier = null;
  await signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
