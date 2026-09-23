import { after } from "next/server";
import { getBlockStatus } from "@/lib/db";
import { pushConfigured, sendPushToUser, type PushMessage } from "@/lib/push";

/**
 * The four things PlateMaps pushes about, and the words it uses.
 *
 * Routes call one function each, after the write has succeeded and before
 * they answer. Every function schedules its send with `after()`, so the
 * response is never held for APNs — on Vercel that is also what keeps the
 * function alive long enough for the send to finish once the response has
 * gone out.
 *
 * What is *not* here on purpose: votes (a downvote notification is a fight
 * starter and an upvote one is noise next to hearts), points and ranks (the
 * celebration screen already does that, in the moment), and anything about
 * a restaurant. Notifications are people talking to you; the feed is
 * everything else.
 *
 * Every recipient check ("not yourself", "not twice") lives here rather than
 * in the routes, so a route cannot forget one. Block checks start in the
 * routes — a blocked pair should never reach a write — and are repeated here
 * per recipient, because a write can reach more people than the route
 * checked (a reply notifies the parent comment's author, not just the post's).
 *
 * URLs are the phone's: the only thing that receives a push is the app, and
 * the app is `/m`. `PushRegistration` navigates to `url` when the
 * notification is tapped.
 */

type Actor = { id: string; name: string };
type PostLike = { id: string; userId: string; dishName?: string; restaurant?: string };

/** "your carbonara plate", "your plate at Luna Grill", or just "your plate". */
function plateLabel(post: PostLike): string {
  if (post.dishName) return `your ${post.dishName} plate`;
  if (post.restaurant) return `your plate at ${post.restaurant}`;
  return "your plate";
}

/** One line of a comment, trimmed to fit a lock-screen banner. */
function snippet(text: string, max = 110): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

function queue(userId: string, actorId: string, message: PushMessage): void {
  if (!pushConfigured()) return;
  after(async () => {
    if ((await getBlockStatus(actorId, userId)) !== "none") return;
    await sendPushToUser(userId, message);
  });
}

/**
 * A comment landed on a post. Tells the post's author, and — for a reply —
 * the comment being replied to's author, unless either of them is the
 * commenter or they are the same person.
 */
export function notifyComment(
  post: PostLike,
  commenter: Actor,
  text: string,
  parentAuthorId: string | null,
): void {
  const url = `/m/feed?post=${post.id}`;
  const threadId = `post:${post.id}`;
  const body = snippet(text);

  if (parentAuthorId && parentAuthorId !== commenter.id) {
    queue(parentAuthorId, commenter.id, {
      title: `${commenter.name} replied to your comment`,
      body,
      url,
      threadId,
    });
  }

  if (post.userId !== commenter.id && post.userId !== parentAuthorId) {
    queue(post.userId, commenter.id, {
      title: `${commenter.name} commented on ${plateLabel(post)}`,
      body,
      url,
      threadId,
    });
  }
}

/**
 * A heart. Collapsed per hearter-and-post, so someone tapping the heart on
 * and off does not stack a notification for every tap — the newest replaces
 * the last, and only a heart being *set* gets here at all.
 */
export function notifyHeart(post: PostLike, hearter: Actor): void {
  if (post.userId === hearter.id) return;
  queue(post.userId, hearter.id, {
    title: `${hearter.name} hearted ${plateLabel(post)}`,
    body: "Tap to see who else has.",
    url: `/m/feed?post=${post.id}`,
    threadId: `post:${post.id}`,
    collapseId: `heart:${post.id}:${hearter.id}`,
  });
}

/** Someone wants to be friends. Sent only for a request that was actually created. */
export function notifyFriendRequest(recipientId: string, requester: Actor): void {
  if (recipientId === requester.id) return;
  queue(recipientId, requester.id, {
    title: `${requester.name} sent you a friend request`,
    body: "Accept it to see each other's plates.",
    url: "/m/friends",
    threadId: "friends",
    collapseId: `friend-request:${requester.id}`,
  });
}

/** The request you sent was accepted. */
export function notifyFriendAccepted(requesterId: string, accepter: Actor): void {
  if (requesterId === accepter.id) return;
  queue(requesterId, accepter.id, {
    title: `${accepter.name} accepted your friend request`,
    body: "You're friends now — their plates are in your feed.",
    url: `/m/u/${accepter.id}`,
    threadId: "friends",
    collapseId: `friend-accepted:${accepter.id}`,
  });
}
