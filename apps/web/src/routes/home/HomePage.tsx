import { TRUST_FACTS, type TrustFacts } from '../../config/trust-facts.ts';
import { LANDING_CONTENT, draftsVisible, type LandingContent } from '../../content/landing.ts';
import { PROOF_CONTENT, type ProofContent } from '../../content/proof.ts';
import {
  AboutSection,
  DonationHelpsSection,
  HeroSection,
  HowItWorksSection,
  WaysWeHelpSection,
} from './LandingSections.tsx';
import {
  ContactSection,
  FaqSection,
  FinalCtaSection,
  ImpactSection,
  TransparencySection,
  type ProofProps,
} from './ProofSections.tsx';

interface HomePageProps {
  /** Injected in tests; the live page reads the content file and the confirmed facts. */
  content?: LandingContent;
  proof?: ProofContent;
  states?: ProofProps['states'];
  facts?: TrustFacts;
  showDrafts?: boolean;
}

/**
 * The single public page (ADR 0005), in plan order: hero → how it works (#12), then impact,
 * transparency, FAQ, contact and the final call to action (#13).
 */
export function HomePage({
  content = LANDING_CONTENT,
  proof = PROOF_CONTENT,
  states,
  facts = TRUST_FACTS,
  showDrafts = draftsVisible(),
}: HomePageProps) {
  const props = { content, facts, showDrafts };
  const proofProps: ProofProps = {
    proof,
    landing: content,
    facts,
    showDrafts,
    ...(states ? { states } : {}),
  };
  return (
    <>
      <title>Theonetrust.in</title>
      <HeroSection {...props} />
      <AboutSection {...props} />
      <WaysWeHelpSection {...props} />
      <DonationHelpsSection {...props} />
      <HowItWorksSection {...props} />
      <ImpactSection {...proofProps} />
      <TransparencySection {...proofProps} />
      <FaqSection {...proofProps} />
      <ContactSection {...proofProps} />
      <FinalCtaSection {...proofProps} />
    </>
  );
}
