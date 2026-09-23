import fs from 'fs';
import crypto from 'crypto';

// load env manually
const envPath = 'C:/Users/james/OneDrive/Documents/GitHub/Hilinga-2.0/Hilinga-app-prototype/.env';
const envRaw = fs.readFileSync(envPath,'utf8');
const env = Object.fromEntries(envRaw.split('\n').filter(l=>l.includes('=') && !l.trim().startsWith('#')).map(l=>{
  const i=l.indexOf('=');
  return [l.slice(0,i).trim(), l.slice(i+1).trim()];
}));
console.log('env loaded VITE_FIREBASE_PROJECT_ID', env.VITE_FIREBASE_PROJECT_ID);

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, deleteUser, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, addDoc, getDoc, getDocs, query, where, serverTimestamp, updateDoc, deleteDoc, limit } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);

async function signup(email, pass){
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  return cred.user;
}
async function signIn(email, pass){
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  return cred.user;
}

const rand = Math.random().toString(36).slice(2,8);
const bizEmail = `biz_${rand}@example.com`;
const travEmail = `trav_${rand}@example.com`;
const pass = 'Test123456!';

console.log('Creating business', bizEmail);
const bizUser = await signup(bizEmail, pass);
console.log('biz uid', bizUser.uid);

console.log('Creating traveler', travEmail);
await signOut(auth);
const travUser = await signup(travEmail, pass);
console.log('trav uid', travUser.uid);

// Need to create businesses doc as business user
await signOut(auth);
await signIn(bizEmail, pass);
console.log('signed in as biz, current', auth.currentUser.uid);
const bizName = `Test Biz ${rand}`;
const bizRef = doc(firestore, 'businesses', bizUser.uid);
const nowIso = new Date().toISOString();
await setDoc(bizRef, {
  ownerUid: bizUser.uid,
  name: bizName,
  businessScale: 'Small business',
  category: 'Local Business',
  location: 'Legazpi City, Albay',
  phone: '',
  email: bizEmail,
  hours: 'Open daily 8AM-6PM',
  about: 'Test business for messaging',
  coverUrl: '',
  logoUrl: '',
  latitude: 13.14,
  longitude: 123.74,
  createdAt: nowIso,
  updatedAt: nowIso,
});
console.log('business doc created', bizName);

// Also need profiles docs? Not needed for inquiry but helpful
const profileRefBiz = doc(firestore, 'profiles', bizUser.uid);
try{ await setDoc(profileRefBiz, { id: bizUser.uid, account_mode: 'business', display_name: bizName, avatar_path: null, interests: [], language: 'English', budget_min: null, budget_max: null, notifications_enabled: true, onboarding_completed: true }); console.log('biz profile created'); }catch(e){ console.log('biz profile error', e.message); }

await signOut(auth);
await signIn(travEmail, pass);
console.log('signed in as trav', auth.currentUser.uid);
const travProfileRef = doc(firestore, 'profiles', travUser.uid);
try{ await setDoc(travProfileRef, { id: travUser.uid, account_mode: 'explore', display_name: 'Traveler Test', avatar_path: null, interests: [], language: 'English', budget_min: null, budget_max: null, notifications_enabled: true, onboarding_completed: true }); console.log('trav profile created'); }catch(e){ console.log('trav profile err', e.message); }

// Traveler sends inquiry
console.log('Traveler sending inquiry to business...');
const inquiries = collection(firestore, 'businessInquiries');
let inquiryId = null;
try{
  const docRef = await addDoc(inquiries, {
    businessId: bizUser.uid,
    businessName: bizName,
    senderUid: travUser.uid,
    senderName: 'Traveler Test',
    senderEmail: travEmail,
    message: 'Hello, this is a test inquiry about your business. I would like to know more details for my visit.',
    status: 'unread',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  inquiryId = docRef.id;
  console.log('SUCCESS inquiry created id', inquiryId);
}catch(e){
  console.log('FAIL inquiry create', e.code, e.message);
  if(e.code) console.log('full', e);
}

// Verify rules: Try to read as business
await signOut(auth);
await signIn(bizEmail, pass);
console.log('biz reading inquiries...');
try{
  const q = query(inquiries, where('businessId','==', bizUser.uid), limit(10));
  const snap = await getDocs(q);
  console.log('biz found', snap.size, 'inquiries');
  snap.forEach(d=> console.log(' - inquiry', d.id, d.data().senderName, d.data().message.slice(0,60), 'status', d.data().status));
  // try status update
  if(snap.size>0){
    const first = snap.docs[0];
    console.log('biz marking read...');
    await updateDoc(doc(firestore, 'businessInquiries', first.id), { status: 'read', updatedAt: serverTimestamp() });
    console.log('mark read SUCCESS');
    const updated = await getDoc(doc(firestore, 'businessInquiries', first.id));
    console.log('updated status', updated.data().status);
    // mark unread again
    await updateDoc(doc(firestore, 'businessInquiries', first.id), { status: 'unread', updatedAt: serverTimestamp() });
    console.log('mark unread SUCCESS');
  }
}catch(e){
  console.log('biz read/update fail', e.code, e.message);
}

// Verify traveler can read own sent inquiry
await signOut(auth);
await signIn(travEmail, pass);
console.log('trav reading own inquiries...');
try{
  const q2 = query(inquiries, where('senderUid','==', travUser.uid), limit(10));
  const snap2 = await getDocs(q2);
  console.log('trav found', snap2.size, 'own inquiries (should be 0 or 1 due to rules: traveler can only read if senderUid == auth.uid OR businessId == auth.uid, but query by senderUid should work if read rule allows resource.data.senderUid == auth.uid)');
  // But our rule's read is on resource.data.senderUid == auth.uid, not query filter - Firestore rules require matching document. So this query should succeed if docs exist where senderUid matches.
  // If traveler has no businessId matching, they should still read own sent docs where senderUid == trav uid.
  snap2.forEach(d=> console.log(' trav sees', d.id, d.data().businessName));
}catch(e){
  console.log('trav read fail', e.code, e.message);
}

// Test negative: senderEmail mismatch should fail
console.log('Testing senderEmail mismatch (should fail)...');
try{
  await addDoc(inquiries, {
    businessId: bizUser.uid,
    businessName: bizName,
    senderUid: travUser.uid,
    senderName: 'Traveler Test',
    senderEmail: 'wrong@example.com', // not equal to auth token email
    message: 'This should be rejected due to senderEmail mismatch.',
    status: 'unread',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  console.log('UNEXPECTED success senderEmail mismatch');
}catch(e){
  console.log('Correctly rejected senderEmail mismatch', e.code);
}

// Test short message <10 chars should fail (server rule + client check)
console.log('Testing short message (client would reject, but server also requires >=10)...');
try{
  await addDoc(inquiries, {
    businessId: bizUser.uid,
    businessName: bizName,
    senderUid: travUser.uid,
    senderName: 'Traveler Test',
    senderEmail: travEmail,
    message: 'Hi', // 2 chars
    status: 'unread',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  console.log('UNEXPECTED short message success');
}catch(e){
  console.log('Correctly rejected short message', e.code, e.message.slice(0,300));
}

// Test businessName mismatch should fail
console.log('Testing businessName mismatch (should fail)...');
try{
  await addDoc(inquiries, {
    businessId: bizUser.uid,
    businessName: 'Wrong Name',
    senderUid: travUser.uid,
    senderName: 'Traveler Test',
    senderEmail: travEmail,
    message: 'This is a valid length message but wrong business name.',
    status: 'unread',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  console.log('UNEXPECTED businessName mismatch success');
}catch(e){
  console.log('Correctly rejected businessName mismatch', e.code);
}

console.log('\n=== DIAGNOSIS COMPLETE ===');
console.log('If inquiry create succeeded and mark read succeeded, messaging is WORKING.');
console.log('Cleanup: deleting test data...');

// cleanup via deleting docs as appropriate users
await signOut(auth);
await signIn(bizEmail, pass);
try{
  if(inquiryId){
    await deleteDoc(doc(firestore,'businessInquiries', inquiryId));
    console.log('deleted inquiry', inquiryId);
  }
  // also delete any other test inquiries via query
  const q3 = query(inquiries, where('businessId','==', bizUser.uid));
  const snap3 = await getDocs(q3);
  for(const d of snap3.docs){
    if(d.data().senderName==='Traveler Test'){
      await deleteDoc(doc(firestore,'businessInquiries', d.id));
      console.log('deleted extra inquiry', d.id);
    }
  }
  await deleteDoc(bizRef);
  console.log('deleted business doc');
  await deleteDoc(profileRefBiz);
  await deleteDoc(travProfileRef);
}catch(e){ console.log('cleanup doc error', e.message); }

// delete users (requires recent login)
async function deleteCurrentUser(){
  if(auth.currentUser){
    try{ await deleteUser(auth.currentUser); console.log('deleted user', auth.currentUser?.email); }catch(e){ console.log('deleteUser fail need re-auth', e.code, e.message); }
  }
}
await deleteCurrentUser();
await signOut(auth);
await signIn(travEmail, pass);
await deleteCurrentUser();

console.log('Done');
process.exit(0);
