import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  addDoc
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Incident, LiveEvent, MetricsSnapshot, CooldownConfig, ChannelConfig } from './types';

export const firebaseConfig = {
  apiKey: "AIzaSyDHcyP35KH-7-PFTUwMdykGo3GGP0MMbgg",
  authDomain: "hackthon-noise.firebaseapp.com",
  projectId: "hackthon-noise",
  storageBucket: "hackthon-noise.firebasestorage.app",
  messagingSenderId: "778660375621",
  appId: "1:778660375621:web:ff4f5f1737ea27447dc72c",
  measurementId: "G-VHKNF27ZSG"
};

// Initialize Firebase App singleton
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);

/**
 * Real-time listener for active and historical incidents in Firestore
 */
export function subscribeToIncidents(callback: (incidents: Incident[]) => void) {
  const incidentsRef = collection(db, 'incidents');
  const q = query(incidentsRef, orderBy('lastSeen', 'desc'), limit(100));

  return onSnapshot(
    q,
    (snapshot) => {
      const incidents: Incident[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const firstSeen = data.firstSeen instanceof Timestamp ? data.firstSeen.toDate().toISOString() : data.firstSeen || new Date().toISOString();
        const lastSeen = data.lastSeen instanceof Timestamp ? data.lastSeen.toDate().toISOString() : data.lastSeen || new Date().toISOString();
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString();

        return {
          id: docSnap.id,
          fingerprint: data.fingerprint || '',
          service: data.service || 'unknown',
          errorType: data.errorType || 'Error',
          severity: data.severity || 'medium',
          status: data.status || 'firing',
          normalizedMessage: data.normalizedMessage || '',
          sampleStackTrace: data.sampleStackTrace || '',
          occurrenceCount: data.occurrenceCount || 1,
          affectedInstances: data.affectedInstances || [],
          firstSeen,
          lastSeen,
          alertChannelRef: data.alertChannelRef || null,
          createdAt,
        };
      });
      callback(incidents);
    },
    (error) => {
      console.warn('[Firebase] Firestore incidents listener notice:', error.message);
    }
  );
}

/**
 * Real-time listener for rollup metrics snapshots in Firestore
 */
export function subscribeToMetricsHistory(limitCount: number = 30, callback: (snapshots: MetricsSnapshot[]) => void) {
  const metricsRef = collection(db, 'metricsSnapshots');
  const q = query(metricsRef, orderBy('timestamp', 'desc'), limit(limitCount));

  return onSnapshot(
    q,
    (snapshot) => {
      const history: MetricsSnapshot[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const timestamp = data.timestamp instanceof Timestamp ? data.timestamp.toDate().toISOString() : data.timestamp || new Date().toISOString();

        return {
          id: docSnap.id,
          timestamp,
          rawEventsReceived: data.rawEventsReceived || 0,
          notificationsSent: data.notificationsSent || 0,
          noiseReductionRatio: data.noiseReductionRatio || 0,
        };
      });
      callback(history.reverse());
    },
    (error) => {
      console.warn('[Firebase] Firestore metrics listener notice:', error.message);
    }
  );
}

/**
 * Real-time listener for the live event feed stream (/liveFeed collection)
 */
export function subscribeToLiveFeed(callback: (event: LiveEvent) => void) {
  const feedRef = collection(db, 'liveFeed');
  const q = query(feedRef, orderBy('timestamp', 'desc'), limit(1));

  let isFirst = true;
  return onSnapshot(
    q,
    (snapshot) => {
      if (isFirst) {
        isFirst = false;
        return; // Ignore existing docs on initial bind, stream only new arrivals
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const timestamp = data.timestamp instanceof Timestamp ? data.timestamp.toDate().toISOString() : data.timestamp || new Date().toISOString();

          callback({
            id: change.doc.id,
            incidentId: data.incidentId || '',
            fingerprint: data.fingerprint || '',
            service: data.service || 'unknown',
            errorType: data.errorType || 'Error',
            severity: data.severity || 'medium',
            rawMessage: data.rawMessage || data.message || '',
            normalizedMessage: data.normalizedMessage || '',
            instanceId: data.instanceId || 'inst-1',
            timestamp,
            suppressed: Boolean(data.suppressed),
          });
        }
      });
    },
    (error) => {
      console.warn('[Firebase] Firestore liveFeed listener notice:', error.message);
    }
  );
}

/**
 * Real-time listener for Cooldown Matrix configuration
 */
export function subscribeToCooldownConfig(callback: (config: CooldownConfig) => void) {
  const docRef = doc(db, 'config', 'cooldownMatrix');
  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data() as CooldownConfig);
      }
    },
    (error) => {
      console.warn('[Firebase] Cooldown config listener notice:', error.message);
    }
  );
}

/**
 * Actions: Silence an incident
 */
export async function silenceIncidentInFirestore(incidentId: string, durationSeconds: number = 3600) {
  const incidentRef = doc(db, 'incidents', incidentId);
  await updateDoc(incidentRef, {
    status: 'cooling_down',
    silencedUntil: Timestamp.fromMillis(Date.now() + durationSeconds * 1000),
  });
}

/**
 * Actions: Resolve an incident
 */
export async function resolveIncidentInFirestore(incidentId: string) {
  const incidentRef = doc(db, 'incidents', incidentId);
  await updateDoc(incidentRef, {
    status: 'resolved',
    resolvedAt: serverTimestamp(),
  });
}

/**
 * Actions: Save Cooldown Matrix
 */
export async function saveCooldownConfigToFirestore(config: CooldownConfig) {
  const configRef = doc(db, 'config', 'cooldownMatrix');
  await setDoc(configRef, { ...config, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Actions: Direct ingest simulation
 */
export async function emitSimulatedEventToFirestore(event: Partial<LiveEvent>) {
  await addDoc(collection(db, 'liveFeed'), {
    ...event,
    timestamp: serverTimestamp(),
  });
}
