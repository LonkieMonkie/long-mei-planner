// Thin wrapper around Firebase Auth and Firestore, loaded from Google's CDN only when
// syncing is configured. The whole planner lives in one document, planner/shared; profile
// pictures are kept apart in planner/avatars.
const VERSION = '13.3.0';
const sdk = name => import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${VERSION}/firebase-${name}.js`);

export async function connect(config) {
  const [{ initializeApp }, auth, store] = await Promise.all([sdk('app'), sdk('auth'), sdk('firestore')]);
  const app = initializeApp(config);
  const session = auth.getAuth(app);
  const db = store.getFirestore(app);
  const ref = store.doc(db, 'planner', 'shared');
  const avatarsRef = store.doc(db, 'planner', 'avatars');
  return {
    onUser: listener => auth.onAuthStateChanged(session, user => listener(user ? { uid: user.uid, email: user.email } : null)),
    // With `remember` the sign-in survives closing the browser; without it, it ends with the tab.
    signIn: async (email, password, remember) => {
      await auth.setPersistence(session, remember ? auth.browserLocalPersistence : auth.browserSessionPersistence);
      return auth.signInWithEmailAndPassword(session, email, password);
    },
    signOut: () => auth.signOut(session),
    resetPassword: email => auth.sendPasswordResetEmail(session, email),
    // Calls onData with the shared document (or null before it exists) every time it changes.
    subscribe: (onData, onError) => store.onSnapshot(ref, { includeMetadataChanges: true },
      snapshot => onData(snapshot.exists() ? snapshot.data() : null, snapshot.metadata.fromCache), onError),
    subscribeAvatars: (onData, onError) => store.onSnapshot(avatarsRef, snapshot => onData(snapshot.exists() ? snapshot.data() : {}), onError),
    // Sets or (with null) removes one person's picture without touching the other's.
    setAvatar: (personId, url) => store.setDoc(avatarsRef, { [personId]: url ?? store.deleteField() }, { merge: true }),
    // Reads the latest document, applies `change`, and writes the result atomically.
    transact: change => store.runTransaction(db, async transaction => {
      const snapshot = await transaction.get(ref);
      const next = change(snapshot.exists() ? snapshot.data() : null);
      if (next) transaction.set(ref, next);
      return next;
    }),
  };
}
