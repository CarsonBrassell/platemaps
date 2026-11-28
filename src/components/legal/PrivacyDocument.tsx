import Link from "next/link";
import { Section, List, LegalTOC } from "@/components/legal/LegalSection";
import { contactsMatchEnabled, phoneMatchingAvailable, phoneVerifyAvailable } from "@/lib/contactsConfig";

/**
 * The body of the Privacy Policy, shared by the desktop page (`/privacy`) and the phone page
 * (`/m/privacy`) so the text lives in exactly one place. Only the frame around it
 * differs: the desktop page adds `Header`, the phone page adds a back bar.
 * `termsHref` is where the cross-link to the sibling document points, which is the
 * one thing that has to change between the two bodies.
 *
 * **The contacts and phone-number passages are conditional, and must stay so.**
 * "Find friends from your contacts" ships switched off, and a policy should
 * not describe collection that is not happening. So the contacts text is part
 * of the document only when `contactsMatchEnabled()` is true, read from the
 * same server-side switches the routes use. Phone numbers have two gates,
 * because the app has two states: `phoneMatchingAvailable()` (the switch and
 * the hashing key) is when scrambled numbers are HELD and matched, so it
 * gates everything about what is kept and who can find you by it;
 * `phoneVerifyAvailable()` (that plus Twilio) is when a number can be ADDED,
 * so it gates only the sentences about texting a code and about Twilio. If
 * the Twilio values are ever taken out after numbers were collected, the
 * policy must go on describing the numbers still on file. This is a
 * server component on a prerendered page, so the answer is the one at build
 * time, which is also when a changed environment variable takes effect for
 * the routes. Set LAST_UPDATED to the day each switch is turned on.
 */
const LAST_UPDATED = "November 17, 2026";

const SECTIONS = [
  { id: "overview", title: "1. Overview" },
  { id: "collect", title: "2. Information We Collect" },
  { id: "location", title: "3. Location Information" },
  { id: "use", title: "4. How We Use Your Information" },
  { id: "cookies", title: "5. Cookies and Similar Technologies" },
  { id: "share", title: "6. How We Share Your Information" },
  { id: "retention", title: "7. Data Retention and Deletion" },
  { id: "rights", title: "8. Your Privacy Choices and Rights" },
  { id: "notice-at-collection", title: "9. California Notice at Collection" },
  { id: "children", title: "10. Children's Privacy" },
  { id: "security", title: "11. Data Security" },
  { id: "storage", title: "12. Where We Store and Process Data" },
  { id: "third-party", title: "13. Third-Party Services and Links" },
  { id: "changes", title: "14. Changes to This Policy" },
  { id: "contact", title: "15. Contact Us" },
];

const TABLE_ROWS = [
  {
    category: "Identifiers",
    examples: "Name, email address, account ID",
    purpose: "Create and secure your account; communicate with you",
  },
  {
    category: "Account credentials",
    examples: "Password (stored only as a one-way bcrypt hash, never in plain text)",
    purpose: "Authenticate you when you sign in",
  },
  {
    category: "User-generated content",
    examples: "Posts, restaurant and dish ratings, comments, upvotes, hearts, aspect votes",
    purpose: "Operate the Feed, Discover, and leaderboard features",
  },
  {
    category: "Photos",
    examples: "Profile photo; post photos (shown publicly on the feed)",
    purpose: "Display your profile and posts as you've configured them",
  },
  {
    category: "Precise geolocation",
    examples: "Latitude/longitude, only when you use “Nearby”",
    purpose: "Compute distance to restaurants for that one request",
  },
  {
    category: "Usage and device data",
    examples: "Pages viewed, general usage patterns, log data (IP address, browser type)",
    purpose: "Operate, secure, and improve the Service",
  },
  {
    category: "Device identifiers",
    examples: "Push notification token for the iOS app, only if you allow notifications",
    purpose: "Deliver the notifications you turned on",
  },
  {
    category: "Inferences",
    examples: "Favorite cuisine or restaurant, if you set one in your profile",
    purpose: "Personalize your experience",
  },
];

/** Extra Notice-at-Collection rows, present only while the features they describe are on. */
function contactsTableRows(contacts: boolean, phone: boolean) {
  if (!contacts) return [];
  return [
    {
      category: "Contacts (iOS app, optional)",
      examples: phone
        ? "Email addresses and, if you have added a phone number, phone numbers from your phone’s address book, only if you choose “Find friends from your contacts”"
        : "Email addresses from your phone’s address book, only if you choose “Find friends from your contacts”",
      purpose:
        "Check once whether they belong to PlateMaps members who chose to be found; not stored",
    },
    ...(phone
      ? [
          {
            category: "Phone number (optional)",
            examples:
              "A scrambled (keyed-hash) version of your mobile number and its last four digits, if you have added and verified one",
            purpose: "Let people who already have your number find you, if you turn that on",
          },
        ]
      : []),
  ];
}

export function PrivacyDocument({ termsHref }: { termsHref: string }) {
  const contacts = contactsMatchEnabled();
  // Neither is ever true without `contacts`: the phone half is built on the
  // same switch. `phoneHeld`: scrambled numbers are stored and matched.
  // `phoneVerify`: a number can be added now, by a texted code. See the header.
  const phoneHeld = contacts && phoneMatchingAvailable();
  const phoneVerify = contacts && phoneVerifyAvailable();
  const tableRows = [...TABLE_ROWS, ...contactsTableRows(contacts, phoneHeld)];

  return (
    <div className="px-4 pt-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono mb-2 text-xs uppercase tracking-[0.14em] text-pm-orange-text">
          Legal
        </p>
        <h1 className="font-display mb-2 text-3xl font-semibold text-zinc-900 sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="font-mono mb-8 text-xs text-zinc-500">Last updated: {LAST_UPDATED}</p>

        <div className="mb-10 rounded-2xl bg-pm-orange-tint p-4 text-sm leading-relaxed text-pm-orange-text sm:p-5">
          This Privacy Policy explains what personal information PlateMaps
          (&ldquo;PlateMaps,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;)
          collects, how we use and share it, and the choices and rights available to you. It
          is part of our{" "}
          <Link href={termsHref} className="underline underline-offset-2">
            Terms of Service
          </Link>
          . If you do not agree with this Policy, do not use the Service.
        </div>

        <LegalTOC sections={SECTIONS} />

        <Section id="overview" title="1. Overview">
          <p>
            This Policy applies to the PlateMaps website and related services (the
            &ldquo;Service&rdquo;). It applies to all visitors and account holders. We are a
            San Diego-focused restaurant discovery and social platform; we do not sell your
            personal information, and we ask you to check a box agreeing to this Policy and
            our Terms before you can create an account.
          </p>
        </Section>

        <Section id="collect" title="2. Information We Collect">
          <p>We collect information in three ways: what you give us, what you create on
            the Service, and what we observe automatically.</p>
          <List>
            <li>
              <span className="font-medium text-zinc-900">Information you provide:</span> your
              name, email address, and password when you create an account; your profile
              photo if you upload one; any preferences you set (like a favorite cuisine, or
              the cuisines you pick or skip under &ldquo;Your taste&rdquo; on Discover); the places you mark
              &ldquo;Been here&rdquo; or &ldquo;Not for me&rdquo;, which stay private to you and only shape your own
              picks; and
              anything you type into the Service, including support requests.
            </li>
            <li>
              <span className="font-medium text-zinc-900">Signing in with Apple or Google:</span>{" "}
              where we offer it, you can choose to sign in with your Apple or Google account
              instead of a password. If you do, we store the email address that service
              shares with us and an identifier it assigns to you, so we can recognize you
              the next time you sign in. We do not store your name or profile picture from
              that service, we never receive your Apple or Google password, and we never
              post anything to those services. For Apple, we also keep an encrypted token
              whose only use is to tell Apple to end the connection. You can disconnect
              either service in Settings, and disconnecting it or deleting your account
              removes this information and revokes that token.
            </li>
            {contacts && (
              <li>
                <span className="font-medium text-zinc-900">Contacts, if you choose to share them:</span>{" "}
                In the iOS app you can tap &ldquo;Find friends from your contacts&rdquo;. If
                you allow it, the app reads your address book on your phone and sends us only
                the email addresses in it
                {phoneHeld && ", and, if you have added a phone number to your account, the phone numbers in it"}
                . Photos, notes and everything else in your contacts stay on your phone. We
                compare what you sent with the accounts of members who have chosen to be found
                this way, send back the matches, and then discard what you sent. We do not
                store your contacts, we do not build profiles of people who are not members,
                and we never contact anyone in your address book. If you tap
                &ldquo;Invite&rdquo; next to a contact, your phone opens its own Messages or
                Mail app with a message you can read and edit; you send it, from your own
                number or address. You can turn contacts access off at any time in your
                iPhone&rsquo;s Settings.
              </li>
            )}
            {phoneHeld && (
              <li>
                <span className="font-medium text-zinc-900">Phone number, if you add one:</span>{" "}
                {phoneVerify
                  ? "You may add a mobile number to your account. We text a one-time code to confirm it is yours (message and data rates may apply). After that we keep "
                  : "If you added a mobile number to your account and confirmed it, we keep "}
                a scrambled version of the number that lets us recognize it again, plus its last
                four digits so you can tell which number is on file. We do not keep the number
                itself in readable form.
                {phoneVerify && " We ask you to confirm it again after 12 months."} You
                can remove it at any time in Settings.
              </li>
            )}
            <li>
              <span className="font-medium text-zinc-900">Content you create:</span> posts,
              photos attached to posts, restaurant and dish ratings, comments, upvotes,
              hearts, and aspect votes. See Section 6 of our{" "}
              <Link href={termsHref} className="underline underline-offset-2">
                Terms of Service
              </Link>{" "}
              for how ratings and plate scores work.
            </li>
            <li>
              <span className="font-medium text-zinc-900">Information collected automatically:</span>{" "}
              usage data (pages and features you use), device and browser information, and
              standard server log data (such as IP address and timestamps). If you use
              &ldquo;Nearby,&rdquo; your device&rsquo;s precise location — see Section 3.
            </li>
          </List>
        </Section>

        <Section id="location" title="3. Location Information">
          <p>
            If you use the &ldquo;Nearby&rdquo; feature, your browser sends your device&rsquo;s
            coordinates to our server in a single request so we can compute distance to
            nearby restaurants and return results. That position is used to answer that one
            request and is not stored or logged by us, and it never appears in a URL, browser
            history, or our server logs. You control whether your browser shares your location
            at all — you can decline the browser&rsquo;s location permission prompt and still
            use every other part of the Service.
          </p>
        </Section>

        <Section id="use" title="4. How We Use Your Information">
          <p>We use the information described above to:</p>
          <List>
            <li>Provide, operate, and maintain the Service, including your Feed, Discover results, and Plate Points;</li>
            <li>Create and secure your account, and authenticate you when you sign in;</li>
            <li>Personalize what you see, such as favorite cuisines or nearby results;</li>
            {contacts && (
              <li>
                Help you find people you know who are already on PlateMaps, and, if you turn on
                &ldquo;Find me from contacts&rdquo;, let people who already have your email
                address{phoneHeld && " or phone number"} find your account;
              </li>
            )}
            <li>Communicate with you about your account or the Service;</li>
            <li>Monitor for, investigate, and prevent fraud, abuse, and security incidents;</li>
            <li>Comply with legal obligations and enforce our Terms of Service; and</li>
            <li>Understand how the Service is used so we can improve it.</li>
          </List>
        </Section>

        <Section id="cookies" title="5. Cookies and Similar Technologies">
          <p>
            We use a session cookie to keep you signed in — it is required for the Service to
            function and is not used for advertising. We use Vercel Web Analytics and Speed
            Insights, which are cookieless and record page views and page performance without
            identifying you. If we add analytics or advertising cookies in the future, we will update this Policy and, where required, ask for
            your consent first. We currently do not respond to browser &ldquo;Do Not
            Track&rdquo; signals, but see Section 8 for how we handle Global Privacy Control
            (GPC) signals.
          </p>
        </Section>

        <Section id="share" title="6. How We Share Your Information">
          <p>
            <span className="font-medium text-zinc-900">We do not sell your personal
            information.</span> We share it only in these circumstances:
          </p>
          <List>
            <li>
              <span className="font-medium text-zinc-900">With other users, as intended by the
              Service&rsquo;s design:</span> your posts, ratings, and comments are visible to
              other users according to your settings (posts and their photos appear on the public feed). Upvotes on a post are shown publicly;
              hearts are private and are never shown to anyone, including the post&rsquo;s
              author.
            </li>
            {contacts && (
              <li>
                <span className="font-medium text-zinc-900">With members who already have your
                contact details, if you allow it:</span> if you turn on &ldquo;Find me from
                contacts&rdquo; (it is off unless you turn it on), any member who has your
                confirmed email address{phoneHeld && " or verified phone number"} saved in their
                phone contacts can learn which PlateMaps account is yours, see your username
                and profile, and send you a friend request. That may be someone you would not
                think of as a friend. We never show them your address{phoneHeld && " or number"};
                they learn that something they already had belongs to your account. If you
                post under a name you do not want connected to your email address
                {phoneHeld && " or phone number"}, leave this off. Blocking an account prevents
                that account from finding you this way.
              </li>
            )}
            <li>
              <span className="font-medium text-zinc-900">Service providers:</span> companies
              that host our infrastructure and database, send email on our behalf, or provide
              similar services under contract, and only to the extent needed to provide the
              Service.
              {phoneVerify &&
                " We use Twilio to send verification text messages. Twilio receives the phone number you enter in order to deliver the code and keeps its own delivery records for a limited time."}
            </li>
            <li>
              <span className="font-medium text-zinc-900">Legal and safety reasons:</span> if
              required by law, subpoena, or legal process, or to protect the rights, property,
              or safety of PlateMaps, our users, or the public.
            </li>
            <li>
              <span className="font-medium text-zinc-900">Business transfers:</span> if
              PlateMaps is involved in a merger, acquisition, or sale of assets, your
              information may be transferred as part of that transaction, subject to this
              Policy or a successor policy you are notified of.
            </li>
          </List>
        </Section>

        <Section id="retention" title="7. Data Retention and Deletion">
          <p>
            We keep your account information and most of your content for as long as your
            account is active, so the Service can function as intended (for example, so your
            past posts and ratings continue to display correctly). If you delete your account,
            we delete or anonymize your personal information within a reasonable period, except
            where we are permitted or required to retain it — for example, to resolve disputes,
            enforce our Terms, or comply with a legal obligation.
          </p>
          {contacts && (
            <p>
              Address-book information you share to find friends is not retained: it is used
              to answer that one request and discarded. We keep security counters (that a
              check happened, when, and from which account or network, never what was in it)
              for up to 30 days.
              {phoneHeld &&
                " Your scrambled phone number is removed from your account when you remove it or delete your account; security counters that reference it expire within 30 days."}
            </p>
          )}
        </Section>

        <Section id="rights" title="8. Your Privacy Choices and Rights">
          <p>
            If you are a California resident, the California Consumer Privacy Act, as amended
            by the California Privacy Rights Act (CCPA/CPRA), gives you the right to:
          </p>
          <List>
            <li>Know what personal information we have collected about you and why;</li>
            <li>Delete personal information we have collected from you, subject to certain exceptions;</li>
            <li>Correct inaccurate personal information we maintain about you;</li>
            <li>
              Opt out of the &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; of your personal
              information — as noted above, we do not sell or share personal information for
              cross-context behavioral advertising, so there is nothing to opt out of today;
            </li>
            <li>Limit the use of sensitive personal information (such as precise geolocation) to what is necessary to provide the Service, which is already how we use it; and</li>
            <li>Not be discriminated against for exercising any of these rights.</li>
          </List>
          <p>
            To exercise these rights, contact us using the information in Section 15. We will
            take reasonable steps to verify your identity before acting on a request. You may
            also designate an authorized agent to submit a request on your behalf. Where
            technically feasible, we recognize the{" "}
            <span className="font-medium text-zinc-900">Global Privacy Control (GPC)</span> as
            a valid opt-out-of-sale/sharing signal, consistent with CPRA regulations.
          </p>
          <p>
            Residents of other states with similar privacy laws (for example, Virginia,
            Colorado, Connecticut, or Utah) have comparable rights, which we honor on the same
            basis described in this Section.
          </p>
        </Section>

        <Section id="notice-at-collection" title="9. California Notice at Collection">
          <p>
            As required by California law, this table summarizes the categories of personal
            information we collect, why, and whether we sell or share it.
          </p>
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-pm-orange-border/60">
                  <th className="py-2 pr-3 font-medium text-zinc-900">Category</th>
                  <th className="py-2 pr-3 font-medium text-zinc-900">Examples</th>
                  <th className="py-2 pr-3 font-medium text-zinc-900">Purpose</th>
                  <th className="py-2 font-medium text-zinc-900">Sold / shared?</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.category} className="border-b border-zinc-200 align-top">
                    <td className="py-2 pr-3 font-medium text-zinc-900">{row.category}</td>
                    <td className="py-2 pr-3 text-zinc-600">{row.examples}</td>
                    <td className="py-2 pr-3 text-zinc-600">{row.purpose}</td>
                    <td className="py-2 text-zinc-600">No</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            We retain each category for as long as described in Section 7. None of these
            categories are sold, and none are shared for cross-context behavioral advertising.
          </p>
        </Section>

        <Section id="children" title="10. Children's Privacy">
          <p>
            The Service is not directed to children under 13, and we do not knowingly collect
            personal information from anyone under 13. If we learn that we have collected
            personal information from a child under 13, we will delete it. If you believe a
            child under 13 has provided us personal information, contact us using the
            information in Section 15.
          </p>
        </Section>

        <Section id="security" title="11. Data Security">
          <p>
            We use reasonable technical and organizational measures to protect your
            information, including hashing passwords and using encrypted connections. No
            method of transmission or storage is completely secure, and we cannot guarantee
            absolute security. If we become aware of a breach affecting your personal
            information, we will notify you as required by applicable law.
          </p>
        </Section>

        <Section id="storage" title="12. Where We Store and Process Data">
          <p>
            We store and process data in the United States. The Service is intended for users
            in the United States, and in particular the San Diego area. If you access the
            Service from outside the United States, you understand that your information will
            be transferred to and processed in the United States, which may have different
            data protection laws than your country of residence.
          </p>
        </Section>

        <Section id="third-party" title="13. Third-Party Services and Links">
          <p>
            Certain restaurant information and photographs are sourced from third parties,
            including Yelp Inc., under their own terms; our map is provided by third-party
            mapping and geolocation providers. The Service may also link to restaurant
            websites or other third-party sites. Those third parties have their own privacy
            practices, which we do not control and this Policy does not cover — review their
            policies directly.
          </p>
          {phoneVerify && (
            <p>
              We use Twilio to send verification text messages. Twilio receives the phone
              number you enter in order to deliver the code and keeps its own delivery records
              for a limited time.
            </p>
          )}
        </Section>

        <Section id="changes" title="14. Changes to This Policy">
          <p>
            We may update this Policy from time to time. If we make material changes, we will
            update the &ldquo;Last updated&rdquo; date above and, where you have an account,
            make reasonable efforts to notify you, such as by email or an in-product notice.
            Your continued use of the Service after a change takes effect constitutes your
            acceptance of the revised Policy.
          </p>
        </Section>

        <Section id="contact" title="15. Contact Us">
          <p>
            Questions about this Policy, or requests to exercise your privacy rights, can be
            sent to:
          </p>
          <p className="font-mono text-sm text-zinc-900">
            Carson Brassell (sole proprietor, d/b/a PlateMaps)
            <br />
            4812 Campanile Dr
            <br />
            San Diego, CA 92115
            <br />
            helloplatemaps@gmail.com
          </p>
        </Section>
      </div>
    </div>
  );
}
