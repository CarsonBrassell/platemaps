import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Section, List, LegalTOC } from "@/components/legal/LegalSection";

export const metadata: Metadata = {
  title: "Privacy Policy — PlateMaps",
  description: "How PlateMaps collects, uses, and protects your information.",
};

const LAST_UPDATED = "August 14, 2026";

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
    examples: "Profile photo; post photos (private/friends-only unless you turn on public sharing)",
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
    category: "Inferences",
    examples: "Favorite cuisine or restaurant, if you set one in your profile",
    purpose: "Personalize your experience",
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-7xl pb-16">
      <Header />

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
            <Link href="/terms" className="underline underline-offset-2">
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
                photo if you upload one; any preferences you set (like a favorite cuisine); and
                anything you type into the Service, including support requests.
              </li>
              <li>
                <span className="font-medium text-zinc-900">Content you create:</span> posts,
                photos attached to posts, restaurant and dish ratings, comments, upvotes,
                hearts, and aspect votes. See Section 9 of our{" "}
                <Link href="/terms" className="underline underline-offset-2">
                  Terms of Service
                </Link>{" "}
                for how ratings and &ldquo;Hits&rdquo; scores work.
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
              <li>Communicate with you about your account or the Service;</li>
              <li>Monitor for, investigate, and prevent fraud, abuse, and security incidents;</li>
              <li>Comply with legal obligations and enforce our Terms of Service; and</li>
              <li>Understand how the Service is used so we can improve it.</li>
            </List>
          </Section>

          <Section id="cookies" title="5. Cookies and Similar Technologies">
            <p>
              We use a session cookie to keep you signed in — it is required for the Service to
              function and is not used for advertising. If we add analytics or advertising
              cookies in the future, we will update this Policy and, where required, ask for
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
                other users according to your settings (for example, posts are friends-only
                unless you turn on public photo sharing). Upvotes on a post are shown publicly;
                hearts are private and are never shown to anyone, including the post&rsquo;s
                author.
              </li>
              <li>
                <span className="font-medium text-zinc-900">Service providers:</span> companies
                that host our infrastructure and database, send email on our behalf, or provide
                similar services under contract, and only to the extent needed to provide the
                Service.
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
                  {TABLE_ROWS.map((row) => (
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

          <p className="font-mono text-xs text-zinc-400">
            This document is a template and does not constitute legal advice. See the note
            Carson received alongside this document for what still needs attorney review.
          </p>
        </div>
      </div>
    </div>
  );
}
