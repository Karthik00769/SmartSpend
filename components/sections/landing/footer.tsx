import Link from 'next/link';

export function FooterSection() {
  return (
    <footer className="bg-foreground text-background py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">

          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">💸</span>
              <span className="text-xl font-bold">SmartSpend</span>
            </div>
            <p className="text-sm opacity-70 leading-relaxed">
              Plan Smart. Spend Wisely.<br />Build Your Future.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-widest opacity-60">Product</h4>
            <ul className="space-y-2.5 text-sm opacity-75">
              <li><Link href="#features"    className="hover:opacity-100 transition-opacity">Features</Link></li>
              <li><Link href="#pricing"     className="hover:opacity-100 transition-opacity">Pricing</Link></li>
              <li><Link href="/how-it-works" className="hover:opacity-100 transition-opacity">How It Works</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-widest opacity-60">Company</h4>
            <ul className="space-y-2.5 text-sm opacity-75">
              <li><Link href="#contact" className="hover:opacity-100 transition-opacity">Contact</Link></li>
              <li><Link href="/login"   className="hover:opacity-100 transition-opacity">Sign In</Link></li>
              <li><Link href="/signup"  className="hover:opacity-100 transition-opacity">Get Started</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-widest opacity-60">Legal</h4>
            <ul className="space-y-2.5 text-sm opacity-75">
              <li><span className="opacity-50 cursor-default">Privacy Policy</span></li>
              <li><span className="opacity-50 cursor-default">Terms of Service</span></li>
              <li><span className="opacity-50 cursor-default">Security</span></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-background/20 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm opacity-60">
          <p>© {new Date().getFullYear()} SmartSpend. All rights reserved.</p>
          <p>Made with ❤️ for better finances</p>
        </div>
      </div>
    </footer>
  );
}
