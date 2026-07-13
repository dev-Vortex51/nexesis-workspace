/**
 * Socket.IO event contract.
 *
 * The single source of truth for the real-time surface defined in
 * `05-api-spec.md` → "WebSocket Events (Socket.IO)". Event names, payload
 * shapes, and room-name helpers all live here so the server handlers and any
 * emit call sites stay in lockstep with the spec. Nothing outside the spec's
 * event/room tables is added.
 */

import type { SessionUser } from "../../../shared/schemas/auth";

/**
 * Server → Client event names, exactly as tabulated in the API spec. Payloads
 * for domain objects (Notification, Message, Document, Feedback, Meeting,
 * Grade) are modelled by later feature units; until those types exist the
 * envelope carries the object as-is, so payloads are typed structurally.
 */
export const SERVER_EVENTS = {
  NOTIFICATION_NEW: "notification:new",
  MESSAGE_NEW: "message:new",
  PROJECT_STAGE_CHANGED: "project:stage_changed",
  DOCUMENT_UPLOADED: "document:uploaded",
  FEEDBACK_NEW: "feedback:new",
  MEETING_REMINDER: "meeting:reminder",
  GRADE_SUBMITTED: "grade:submitted",
} as const;

/**
 * Client → Server event names, exactly as tabulated in the API spec, plus the
 * project room lifecycle events this server adds so an authorized participant
 * can subscribe to a project's room without having to emit `user:typing`.
 */
export const CLIENT_EVENTS = {
  USER_TYPING: "user:typing",
  // Join/leave a `project:{projectId}` room. Subscribing is what actually
  // delivers room-scoped server events (message:new, feedback:new,
  // document:uploaded, project:stage_changed) to a passive viewer — it must not
  // depend on typing, which would otherwise emit a false typing signal just to
  // receive messages. The server authorizes the join against the project before
  // adding the socket to the room.
  PROJECT_SUBSCRIBE: "project:subscribe",
  PROJECT_UNSUBSCRIBE: "project:unsubscribe",
} as const;

/** Payload for `project:stage_changed` (workflow advancement). */
export interface ProjectStageChangedPayload {
  projectId: string;
  oldStage: string;
  newStage: string;
}

/** Payload for the client-emitted `user:typing` indicator. */
export interface UserTypingPayload {
  projectId: string;
  userId: string;
}

/**
 * Payload for the project room lifecycle events (`project:subscribe` /
 * `project:unsubscribe`): just the project to join or leave.
 */
export interface ProjectSubscriptionPayload {
  projectId: string;
}

/**
 * Acknowledgement callback the client may pass with `project:subscribe` so it
 * learns whether the subscription was authorized (and thus whether it will
 * receive that project's room events).
 */
export type SubscriptionAck = (result: {
  ok: boolean;
  projectId: string;
}) => void;

/**
 * Typed Server → Client event map for the Socket.IO `Server` generic. Domain
 * objects are surfaced as `unknown` payloads for now; feature units that own
 * those models replace the placeholder as their types land.
 */
export interface ServerToClientEvents {
  [SERVER_EVENTS.NOTIFICATION_NEW]: (notification: unknown) => void;
  [SERVER_EVENTS.MESSAGE_NEW]: (message: unknown) => void;
  [SERVER_EVENTS.PROJECT_STAGE_CHANGED]: (
    payload: ProjectStageChangedPayload,
  ) => void;
  [SERVER_EVENTS.DOCUMENT_UPLOADED]: (document: unknown) => void;
  [SERVER_EVENTS.FEEDBACK_NEW]: (feedback: unknown) => void;
  [SERVER_EVENTS.MEETING_REMINDER]: (meeting: unknown) => void;
  [SERVER_EVENTS.GRADE_SUBMITTED]: (grade: unknown) => void;
  // `user:typing` is defined by the spec as Client → Server; the server relays
  // that same event (unchanged name and payload) to the other members of the
  // project room so peers see the indicator. This is the spec event flowing to
  // room peers, not a new invented event.
  [CLIENT_EVENTS.USER_TYPING]: (payload: UserTypingPayload) => void;
}

/** Typed Client → Server event map for the Socket.IO `Server` generic. */
export interface ClientToServerEvents {
  [CLIENT_EVENTS.USER_TYPING]: (payload: UserTypingPayload) => void;
  [CLIENT_EVENTS.PROJECT_SUBSCRIBE]: (
    payload: ProjectSubscriptionPayload,
    ack?: SubscriptionAck,
  ) => void;
  [CLIENT_EVENTS.PROJECT_UNSUBSCRIBE]: (
    payload: ProjectSubscriptionPayload,
  ) => void;
}

/** No inter-server events are used (single-node broadcast, per the spec). */
export type InterServerEvents = Record<string, never>;

/**
 * Per-socket data. The authenticated principal resolved during the handshake
 * is stashed here so handlers can authorize room joins and typing events
 * without re-reading the session.
 */
export interface SocketData {
  user: SessionUser;
}

/**
 * Room-name helpers. The API spec defines exactly three room namespaces:
 *   - `user:{userId}`             — personal notifications
 *   - `project:{projectId}`       — project-specific events
 *   - `institution:{institutionId}` — institution-wide announcements
 */
export const rooms = {
  user: (userId: string): string => `user:${userId}`,
  project: (projectId: string): string => `project:${projectId}`,
  institution: (institutionId: string): string => `institution:${institutionId}`,
} as const;
