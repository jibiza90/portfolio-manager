import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { PersistedState } from '../types';

// Firebase config (proporcionado por el usuario)
const firebaseConfig = {
  apiKey: 'AIzaSyDBRpCpb2xj_iHQh8JiLv0xRKjfWJj0Az8',
  authDomain: 'portfolio-manager-b40b8.firebaseapp.com',
  projectId: 'portfolio-manager-b40b8',
  storageBucket: 'portfolio-manager-b40b8.firebasestorage.app',
  messagingSenderId: '286094409889',
  appId: '1:286094409889:web:74337eabc0e336a02930e0'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const portfolioRef = doc(db, 'portfolio', 'state');

const emptyPersisted: PersistedState = { finalByDay: {}, movementsByClient: {} };

export const fetchPortfolioState = async (): Promise<PersistedState> => {
  try {
    const snap = await getDoc(portfolioRef);
    if (snap.exists()) {
      const data = snap.data() as PersistedState;
      return {
        finalByDay: data.finalByDay ?? {},
        movementsByClient: data.movementsByClient ?? {}
      };
    }
    return emptyPersisted;
  } catch (error) {
    console.error('Firestore fetch error', error);
    return emptyPersisted;
  }
};

export const savePortfolioState = async (state: PersistedState) => {
  try {
    await setDoc(portfolioRef, state, { merge: true });
  } catch (error) {
    console.error('Firestore save error', error);
  }
};
