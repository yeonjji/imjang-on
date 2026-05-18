import { Nav } from './_components/nav';
import { Footer } from './_components/footer';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Nav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
