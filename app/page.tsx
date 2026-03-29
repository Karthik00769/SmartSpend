import { LandingNav }       from '@/components/layout/LandingNav';
import { HeroSection }       from '@/components/sections/landing/hero';
import { HowItWorksSection } from '@/components/sections/landing/how-it-works';
import { FeaturesSection }   from '@/components/sections/landing/features';
import { PricingSection }    from '@/components/sections/landing/pricing';
import { ContactSection }    from '@/components/sections/landing/contact';
import { FooterSection }     from '@/components/sections/landing/footer';

export default function Home() {
  return (
    <>
      <LandingNav />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <FeaturesSection />
        <PricingSection />
        <ContactSection />
        <FooterSection />
      </main>
    </>
  );
}
