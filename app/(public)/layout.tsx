import { Nav } from './_components/nav';
import { Footer } from './_components/footer';
import { AdSenseScript } from './_components/adsense-script';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AdSenseScript />
      <Nav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
