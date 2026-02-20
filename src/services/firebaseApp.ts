import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDBRpCpb2xj_iHQh8JiLv0xRKjfWJj0Az8',
  authDomain: 'portfolio-manager-b40b8.firebaseapp.com',
  projectId: 'portfolio-manager-b40b8',
  storageBucket: 'portfolio-manager-b40b8.firebasestorage.app',
  messagingSenderId: '286094409889',
  appId: '1:286094409889:web:74337eabc0e336a02930e0'
};

const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);

export { app, firebaseConfig };
export const auth = app.auth();
export const db = app.firestore();

export type FirebaseUser = firebase.User;
