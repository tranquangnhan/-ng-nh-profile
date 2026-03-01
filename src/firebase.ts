import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAZKSX6cy4Z3WMmv1nfjB1FdR3bD84ZVt4",
  authDomain: "logingg-290206.firebaseapp.com",
  databaseURL: "https://logingg-290206-default-rtdb.firebaseio.com",
  projectId: "logingg-290206",
  storageBucket: "logingg-290206.appspot.com",
  messagingSenderId: "179440485474",
  appId: "1:179440485474:web:230ff272b07f9705593d3b",
  measurementId: "G-VX0ZFYFGJD"
};

// NOTE: Firebase configuration is hardcoded for this demo as requested.
// In a production environment, these should be stored in environment variables.

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
