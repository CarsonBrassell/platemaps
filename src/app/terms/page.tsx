import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Section, List, LegalTOC } from "@/components/legal/LegalSection";

export const metadata: Metadata = {
  title: "Terms of Service — PlateMaps",
  description: "The terms that govern your use of PlateMaps.",
};

const LAST_UPDATED = "August 14, 2026";

const SECTIONS = [
  { id: "acceptance", title: "1. Acceptance of Terms" },
  { id: "eligibility", title: "2. Eligibility and Accounts" },
  { id: "service", title: "3. Description of the Service" },
  { id: "content", title: "4. Your Content" },
  { id: "conduct", title: "5. Prohibited Conduct, Reporting, and Moderation" },
  { id: "ratings", title: "6. Ratings, Reviews, and Content Disclaimer" },
  { id: "promoted", title: "7. Promoted Listings, Advertising, and Paid Placement" },
  { id: "points", title: "8. Plate Points" },
  { id: "health", title: "9. Food, Allergen, and Health and Safety Disclaimer" },
  { id: "third-party", title: "10. Third-Party Content and Services" },
  { id: "ip", title: "11. Intellectual Property and DMCA Policy" },
  { id: "privacy", title: "12. Privacy" },
  { id: "warranty", title: "13. Disclaimer of Warranties" },
  { id: "liability", title: "14. Limitation of Liability" },
  { id: "indemnification", title: "15. Indemnification" },
  { id: "termination", title: "16. Suspension and Termination" },
  { id: "disputes", title: "17. Dispute Resolution, Arbitration, and Class Action Waiver" },
  { id: "governing-law", title: "18. Governing Law and Venue" },
  { id: "changes", title: "19. Changes to These Terms" },
  { id: "misc", title: "20. General Provisions" },
  { id: "contact", title: "21. Contact Us" },
];

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl pb-16">
      <Header />

      <div className="px-4 pt-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <p className="font-mono mb-2 text-xs uppercase tracking-[0.14em] text-pm-orange-text">
            Legal
          </p>
          <h1 className="font-display mb-2 text-3xl font-semibold text-zinc-900 sm:text-4xl">
            Terms of Service
          </h1>
          <p className="font-mono mb-8 text-xs text-zinc-500">Last updated: {LAST_UPDATED}</p>

          <div className="mb-10 rounded-2xl bg-pm-orange-tint p-4 text-sm leading-relaxed text-pm-orange-text sm:p-5">
            Welcome to PlateMaps. These Terms of Service (&ldquo;Terms&rdquo;) form a
            binding legal agreement between you and PlateMaps (&ldquo;PlateMaps,&rdquo;
            &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) governing your access to
            and use of the PlateMaps website, mobile experience, and related services
            (collectively, the &ldquo;Service&rdquo;). By creating an account, browsing the
            Service, or otherwise using it, you agree to these Terms and to our{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            , which is incorporated by reference. If you do not agree, do not use the
            Service.
          </div>

          <LegalTOC sections={SECTIONS} />

          <Section id="acceptance" title="1. Acceptance of Terms">
            <p>
              These Terms apply to all visitors, users, restaurant partners, and others
              who access or use the Service. By using the Service you represent that you
              have read, understood, and agree to be bound by these Terms. If you are
              using the Service on behalf of a business, organization, or restaurant, you
              represent that you have authority to bind that entity, and &ldquo;you&rdquo;
              refers to that entity.
            </p>
          </Section>

          <Section id="eligibility" title="2. Eligibility and Accounts">
            <p>
              You must be at least 13 years old to use the Service. If you are between 13
              and 17 years old, you represent that a parent or legal guardian has reviewed
              and agreed to these Terms on your behalf and supervises your use of the
              Service. The Service is not directed at children under 13, and we do not
              knowingly collect personal information from anyone under 13. If we learn we
              have done so, we will delete that information.
            </p>
            <p>When you create an account, you agree to:</p>
            <List>
              <li>Provide accurate, current, and complete information;</li>
              <li>Maintain and promptly update that information;</li>
              <li>Keep your password confidential and not share your account;</li>
              <li>
                Accept responsibility for all activity that occurs under your account,
                whether or not you authorized it, except to the extent caused by our
                failure to safeguard your information as described in our Privacy Policy;
              </li>
              <li>Notify us promptly at the contact below if you suspect unauthorized use.</li>
            </List>
            <p>
              We may suspend or terminate your account under Section 16 if information you
              provide is inaccurate, false, or misleading, or if you violate these Terms.
            </p>
          </Section>

          <Section id="service" title="3. Description of the Service">
            <p>
              PlateMaps helps people discover restaurants and dishes in San Diego, share
              their own food posts and ratings, follow other users, and earn Plate Points for
              participating on the Service. We may add, change, or remove features at any
              time, and we do not guarantee that any restaurant, menu item, price,
              operating hours, or other listed information is current, complete, or
              accurate. The Service is provided for personal, non-commercial use unless
              you have a separate written agreement with us (for example, as a restaurant
              partner under Section 7). We may also suspend or discontinue the Service, or
              any part of it, at any time, with or without notice.
            </p>
          </Section>

          <Section id="content" title="4. Your Content">
            <p>
              &ldquo;User Content&rdquo; means anything you post, upload, or submit through
              the Service, including reviews, ratings, dish posts, photos, comments, and
              your profile information. You retain ownership of your User Content. By
              posting it, you grant PlateMaps a worldwide, non-exclusive, royalty-free,
              sublicensable, and transferable license to host, store, reproduce, modify
              (for example, to resize an image for display), publish, publicly display,
              publicly perform, and distribute your User Content in connection with
              operating, providing, promoting, and improving the Service, for as long as
              it remains posted and for a reasonable period afterward for backup, legal,
              or archival purposes.
            </p>
            <p>You represent and warrant that:</p>
            <List>
              <li>
                You own your User Content or have all rights, licenses, consents, and
                releases necessary to grant the license above and to post it without
                violating any third party&rsquo;s rights, including intellectual property,
                privacy, and publicity rights;
              </li>
              <li>
                Your User Content is accurate to the best of your knowledge and reflects
                your genuine experience, and you have not been paid, given anything of
                value, or otherwise incentivized to post it without disclosing that fact as
                required by Section 6;
              </li>
              <li>
                Your User Content does not violate any law or these Terms, including the
                content standards in Section 5.
              </li>
            </List>
            <p>
              We do not pre-screen User Content and are not responsible for it, but we may
              remove or restrict access to any User Content, at any time and without
              notice, that we believe violates these Terms, the law, or our content
              standards, or for any other reason in our discretion.
            </p>
          </Section>

          <Section id="conduct" title="5. Prohibited Conduct, Reporting, and Moderation">
            <p>You agree not to, and not to help or permit anyone else to:</p>
            <List>
              <li>
                Post content that is false, defamatory, harassing, threatening, hateful,
                obscene, or that infringes another person&rsquo;s intellectual property,
                privacy, or publicity rights;
              </li>
              <li>
                Post, solicit, purchase, exchange for compensation, or otherwise incentivize
                fake, misleading, or undisclosed-affiliation reviews or ratings, or
                otherwise attempt to manipulate the Service&rsquo;s ratings, rankings, or
                &ldquo;Hits&rdquo; percentages;
              </li>
              <li>
                Impersonate any person or entity, or misrepresent your affiliation with a
                restaurant, business, or PlateMaps;
              </li>
              <li>
                Use the Service to advertise, solicit, or conduct any commercial activity
                without our prior written consent, other than under a separate restaurant
                partner agreement;
              </li>
              <li>
                Scrape, crawl, harvest, or otherwise systematically extract data from the
                Service, or use automated means to access the Service, without our prior
                written consent;
              </li>
              <li>
                Reverse engineer, decompile, or attempt to derive the source code of the
                Service, or interfere with or disrupt its operation or security;
              </li>
              <li>
                Upload viruses or other malicious code, or attempt to gain unauthorized
                access to any account, system, or network connected to the Service;
              </li>
              <li>
                Use the Service in any way that violates any applicable local, state,
                national, or international law or regulation, including consumer
                protection, anti-spam, and export control laws; or
              </li>
              <li>
                Create an account for anyone other than yourself, or create multiple
                accounts to evade a suspension or to manipulate points, ratings, or
                rankings.
              </li>
            </List>
            <p>
              <strong>No tolerance for objectionable content or abusive users.</strong> We
              do not permit content that is unlawful, hateful, harassing, threatening,
              sexually explicit, or otherwise objectionable, and we do not permit abusive
              behaviour toward other users. Content that violates these Terms may be
              removed, and the account responsible may be suspended or terminated, with or
              without notice.
            </p>
            <p>
              <strong>Reporting.</strong> Every post carries an in-product
              &ldquo;Report&rdquo; option, available from the menu on the post itself. You
              may also contact us using the information in Section 21. Reports of copyright
              infringement specifically should follow the DMCA process in Section 11.
            </p>
            <p>
              <strong>What happens next.</strong> We review reports of objectionable content
              and abusive behaviour and act on them within 24 hours of receiving the report —
              removing the content, ejecting the user who provided it, or both, where we
              determine these Terms have been violated.
            </p>
            <p>
              <strong>Blocking.</strong> You can block another user at any time from the menu
              on any of their posts. Blocking is mutual in effect: their posts, comments and
              profile stop appearing to you, and yours stop appearing to them. You can
              review and undo your blocks from your account settings.
            </p>
          </Section>

          <Section id="ratings" title="6. Ratings, Reviews, and Content Disclaimer">
            <p>
              Ratings, percentages, &ldquo;Hits,&rdquo; reviews, comments, and similar
              content on the Service reflect the individual opinions of the users who
              posted them. They are not verified, edited, or endorsed by PlateMaps unless
              we say otherwise, and they do not necessarily reflect our views. Menus,
              prices, hours, availability, and other restaurant details change frequently
              and may be inaccurate or out of date, including information sourced from
              third parties as described in Section 10.
            </p>
            <p>
              Nothing on the Service is professional, medical, dietary, or nutritional
              advice. See Section 9 for important information about food safety and
              allergens.
            </p>
            <p>
              Reviews, ratings, comments, and other content posted by users are provided by
              those users, not by PlateMaps, and PlateMaps is an interactive computer
              service within the meaning of Section 230 of the Communications Decency Act
              (47 U.S.C. § 230). We do not create, write, or substantively edit user
              reviews, and nothing in these Terms should be read as PlateMaps adopting a
              user&rsquo;s review as its own statement.
            </p>
          </Section>

          <Section id="promoted" title="7. Promoted Listings, Advertising, and Paid Placement">
            <p>
              PlateMaps may receive compensation from restaurants and other businesses in
              exchange for increased visibility, featured placement, or promotional
              labeling within the Service, including listings labeled &ldquo;Promoted,&rdquo;
              &ldquo;Featured,&rdquo; &ldquo;Sponsored,&rdquo; or similar. Where content is
              paid for or otherwise materially connected to an advertiser, we label it as
              such, clearly and conspicuously, consistent with the FTC&rsquo;s Guides
              Concerning the Use of Endorsements and Testimonials in Advertising (16
              C.F.R. Part 255) and the FTC&rsquo;s Trade Regulation Rule on the Use of
              Consumer Reviews and Testimonials (16 C.F.R. Part 465).
            </p>
            <p>
              Paid placement affects only where and how prominently a restaurant appears.
              It does not affect, and cannot be purchased to change, a restaurant&rsquo;s
              underlying star rating, &ldquo;Hits&rdquo; percentages, or user reviews, which
              are generated solely by users. Consistent with 16 C.F.R. Part 465, we do
              not: write, purchase, or generate reviews purporting to reflect the
              experience of a real customer where none exists; suppress or selectively
              filter genuine negative reviews of a paying advertiser; or permit a
              business&rsquo;s own owners, employees, or agents to review that business
              without clearly disclosing the affiliation.
            </p>
            <p>
              A restaurant&rsquo;s participation in a promotional program is not an
              endorsement or guarantee by PlateMaps of that restaurant&rsquo;s quality,
              safety, or any outcome, and PlateMaps does not guarantee any advertiser a
              particular volume of views, visits, orders, or other results. We reserve the
              right to reject, remove, or decline to renew any promoted listing at any
              time, including for a violation of this Section. Terms specific to
              restaurant advertisers, including payment terms, are set out in a separate
              written agreement between PlateMaps and that advertiser, which controls over
              this Section for matters it separately addresses.
            </p>
          </Section>

          <Section id="points" title="8. Plate Points">
            <p>
              Plate Points are a feature of the Service that reward participation, such as
              posting, commenting, and liking content, and that may be used to rank users
              on leaderboards within the Service. Plate Points:
            </p>
            <List>
              <li>Have no cash value and cannot be sold, transferred, or exchanged for money;</li>
              <li>Are not property, a currency, a security, or a deposit of any kind;</li>
              <li>
                May be adjusted, reset (for example, on a monthly cycle), capped, or
                discontinued by us at any time, with or without notice;
              </li>
              <li>
                May be forfeited if your account is suspended or terminated, or if we
                determine in good faith that they were earned through fraud, abuse, fake
                accounts, or manipulation.
              </li>
            </List>
            <p>
              You are solely responsible for any tax obligations, if any, that may arise
              from your participation in the Plate Points program.
            </p>
          </Section>

          <Section id="health" title="9. Food, Allergen, and Health and Safety Disclaimer">
            <p>
              PlateMaps is a discovery and social platform, not a food safety, nutrition,
              or allergen authority. We do not independently verify ingredients,
              preparation methods, allergen handling, or nutritional information for any
              restaurant or dish listed on the Service, whether that information comes
              from a restaurant, a third-party data provider, or another user.
            </p>
            <p className="font-medium text-zinc-900">
              If you have a food allergy, intolerance, or dietary restriction of any kind,
              you must confirm ingredients and preparation directly with the restaurant
              before ordering or eating. Do not rely on the Service as a substitute for
              that confirmation.
            </p>
            <p>
              PlateMaps is not responsible for, and disclaims all liability for, any
              illness, injury, allergic reaction, or other harm arising from food or
              beverages obtained at any restaurant listed on, or discovered through, the
              Service.
            </p>
          </Section>

          <Section id="third-party" title="10. Third-Party Content and Services">
            <p>
              Certain restaurant information, photographs, map tiles, and geolocation data
              displayed on the Service are provided by or sourced from third parties,
              including Yelp Inc., OpenStreetMap contributors (map and place data, licensed
              under the Open Database License), and OpenFreeMap (map tiles), under their
              respective terms of use, and remain the property of their respective owners.
              We attribute this content where required (for
              example, photo credit lines) but do not independently verify it and are not
              responsible for its accuracy, availability, or continued provision. The
              Service may also link to restaurant websites, ordering platforms, or other
              third-party sites that we do not control and are not responsible for. Your
              use of any third-party site or service is governed by that party&rsquo;s own
              terms and privacy policy.
            </p>
            <p className="mt-4">
              <strong className="font-semibold text-zinc-900">Menu information.</strong>{" "}
              Dish names, descriptions, and prices shown on the Service are compiled from
              publicly available sources, including restaurants&rsquo; own published menus,
              and are processed by automated tools. Menus change often and we do not verify
              them; treat everything shown as a starting point rather than an offer, and
              confirm with the restaurant before relying on a price, an ingredient, or the
              availability of a dish. If you are a restaurant owner or rights holder and
              want your menu information corrected or removed, contact us using the details
              in Section 21 and we will act on reasonable requests promptly.
            </p>
          </Section>

          <Section id="ip" title="11. Intellectual Property and DMCA Policy">
            <p>
              The Service, including its design, text, graphics, logos, and the
              &ldquo;PlateMaps&rdquo; name and mark, is owned by PlateMaps or our
              licensors and is protected by intellectual property laws. Except for your
              own User Content and any rights expressly granted to you, we do not grant
              you any right, title, or interest in the Service.
            </p>
            <p>
              We respect intellectual property rights and respond to notices of alleged
              copyright infringement that comply with the Digital Millennium Copyright Act
              (17 U.S.C. § 512). If you believe content on the Service infringes your
              copyright, send a written notice to our designated agent below including:
              (1) a physical or electronic signature of the copyright owner or authorized
              representative; (2) identification of the copyrighted work claimed to be
              infringed; (3) identification of the allegedly infringing material and
              information reasonably sufficient to locate it; (4) your contact
              information; (5) a statement of good-faith belief that the use is not
              authorized; and (6) a statement, under penalty of perjury, that the notice is
              accurate and that you are authorized to act on the copyright owner&rsquo;s
              behalf. Counter-notices are handled under the corresponding provisions of 17
              U.S.C. § 512(g). We may terminate accounts of repeat infringers.
            </p>
            <p className="font-mono text-xs text-zinc-500">
              DMCA Agent: [name to be designated] · [email] · [mailing address] ·
              registered with the U.S. Copyright Office
            </p>
          </Section>

          <Section id="privacy" title="12. Privacy">
            <p>
              Our{" "}
              <Link href="/privacy" className="underline underline-offset-2">
                Privacy Policy
              </Link>{" "}
              describes what personal information we collect (such as your account
              information, content you post, and usage data), how we use and share it, and
              the choices and rights available to you, including rights that may apply to
              California residents under the California Consumer Privacy Act, as amended.
              We do not knowingly collect personal information from children under 13. By
              using the Service, you agree to our collection and use of information as
              described in the Privacy Policy.
            </p>
          </Section>

          <Section id="warranty" title="13. Disclaimer of Warranties">
            <p className="uppercase">
              The service and all content on it are provided &ldquo;as is&rdquo; and
              &ldquo;as available,&rdquo; without warranties of any kind, whether express,
              implied, or statutory, including implied warranties of merchantability,
              fitness for a particular purpose, title, and non-infringement. We do not
              warrant that the service will be uninterrupted, secure, or error-free, that
              defects will be corrected, or that any restaurant, rating, review, or other
              content is accurate, complete, or current.
            </p>
            <p>Some jurisdictions do not allow the exclusion of certain warranties, so some of the above exclusions may not apply to you.</p>
          </Section>

          <Section id="liability" title="14. Limitation of Liability">
            <p className="uppercase">
              To the fullest extent permitted by law, PlateMaps and its officers,
              employees, and agents will not be liable for any indirect, incidental,
              special, consequential, exemplary, or punitive damages, or for any loss of
              profits, data, goodwill, or other intangible losses, arising out of or
              related to your use of, or inability to use, the service, including any harm
              described in section 9, even if we have been advised of the possibility of
              such damages.
            </p>
            <p className="uppercase">
              To the fullest extent permitted by law, our total liability for any claim
              arising out of or relating to these terms or the service will not exceed the
              greater of (a) one hundred dollars ($100) or (b) the amount you paid us, if
              any, in the twelve (12) months before the claim arose.
            </p>
            <p>
              Some jurisdictions do not allow certain limitations of liability, so some of
              the above limitations may not apply to you.
            </p>
          </Section>

          <Section id="indemnification" title="15. Indemnification">
            <p>
              You agree to defend, indemnify, and hold harmless PlateMaps and its
              officers, employees, and agents from and against any claims, liabilities,
              damages, losses, and expenses, including reasonable attorneys&rsquo; fees,
              arising out of or in any way connected with: your use of the Service; your
              User Content; your violation of these Terms; or your violation of any right
              of a third party, including any intellectual property, privacy, or publicity
              right.
            </p>
          </Section>

          <Section id="termination" title="16. Suspension and Termination">
            <p>
              You may stop using the Service and delete your account at any time. We may
              suspend or terminate your access to the Service, or remove any content, at
              any time, with or without notice, including for a suspected violation of
              these Terms, a legal requirement, or a risk to other users or the Service. On
              termination, your license to access the Service ends, but Sections 4 (as to
              content already lawfully used or displayed), 8 (forfeiture of points), 9,
              11&ndash;15, and 17&ndash;20 survive.
            </p>
          </Section>

          <Section id="disputes" title="17. Dispute Resolution, Arbitration, and Class Action Waiver">
            <p>
              Please read this section carefully. It affects your legal rights, including
              your right to go to court.
            </p>
            <p>
              You and PlateMaps agree to first try to resolve any dispute informally by
              contacting us at the address in Section 21. If we cannot resolve a dispute
              informally within 60 days, you and PlateMaps agree that any dispute arising
              out of or relating to these Terms or the Service will be resolved by binding
              individual arbitration administered by the American Arbitration Association
              under its Consumer Arbitration Rules, rather than in court, except that
              either party may bring an individual action in small claims court.
            </p>
            <p>
              You and PlateMaps each waive the right to a jury trial and to participate in
              a class action, class arbitration, or representative action. Nothing in this
              Section prevents either party from seeking public injunctive relief in a
              court of law to the extent that a waiver of that right would be unenforceable
              under applicable law, or from bringing an issue to the attention of a
              federal, state, or local government agency. This Section does not waive any
              right that cannot be waived as a matter of law, including rights under the
              California Consumer Legal Remedies Act (Cal. Civ. Code § 1750 et seq.).
            </p>
            <p>
              You may opt out of this arbitration agreement by sending written notice to
              the address in Section 21 within 30 days of the date you first agree to
              these Terms, stating your name and that you opt out of the arbitration
              agreement.
            </p>
          </Section>

          <Section id="governing-law" title="18. Governing Law and Venue">
            <p>
              These Terms are governed by the laws of the State of California, without
              regard to its conflict-of-laws principles. For any dispute not subject to
              arbitration under Section 17, you and PlateMaps consent to the exclusive
              jurisdiction and venue of the state and federal courts located in San Diego
              County, California.
            </p>
          </Section>

          <Section id="changes" title="19. Changes to These Terms">
            <p>
              We may update these Terms from time to time. If we make material changes, we
              will update the &ldquo;Last updated&rdquo; date above and, where you have an
              account, make reasonable efforts to notify you, such as by email or an
              in-product notice. Your continued use of the Service after a change takes
              effect constitutes your acceptance of the revised Terms.
            </p>
          </Section>

          <Section id="misc" title="20. General Provisions">
            <List>
              <li>
                <span className="font-medium text-zinc-900">Entire agreement.</span> These
                Terms and the Privacy Policy are the entire agreement between you and
                PlateMaps regarding the Service and supersede any prior agreements.
              </li>
              <li>
                <span className="font-medium text-zinc-900">Severability.</span> If any
                provision of these Terms is found unenforceable, the remaining provisions
                remain in full effect.
              </li>
              <li>
                <span className="font-medium text-zinc-900">No waiver.</span> Our failure to
                enforce any provision is not a waiver of our right to do so later.
              </li>
              <li>
                <span className="font-medium text-zinc-900">Assignment.</span> You may not
                assign these Terms without our consent; we may assign them, including in
                connection with a merger, acquisition, or sale of assets.
              </li>
              <li>
                <span className="font-medium text-zinc-900">Feedback.</span> If you send us
                ideas, suggestions, or feedback about the Service, you agree that we may use
                them for any purpose without compensation or obligation to you.
              </li>
              <li>
                <span className="font-medium text-zinc-900">Force majeure.</span> We are not
                liable for any failure or delay caused by events beyond our reasonable
                control.
              </li>
            </List>
          </Section>

          <Section id="contact" title="21. Contact Us">
            <p>Questions about these Terms can be sent to:</p>
            <p className="font-mono text-sm text-zinc-900">
              [PlateMaps legal entity name]
              <br />
              [mailing address]
              <br />
              [contact email]
            </p>
          </Section>

          <p className="font-mono text-xs text-zinc-400">
            This document is a template and does not constitute legal advice. See
            &ldquo;What to do before this goes live&rdquo; in the accompanying notes.
          </p>
        </div>
      </div>
    </div>
  );
}
