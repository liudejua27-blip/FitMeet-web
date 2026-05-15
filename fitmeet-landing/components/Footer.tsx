export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer
      id="footer"
      className="relative px-6 md:px-10 pt-20 pb-10 border-t hairline text-ivory/55 text-[13px]"
    >
      <div className="max-w-[1440px] mx-auto grid md:grid-cols-12 gap-10">
        <div className="md:col-span-4">
          <p className="text-ivory tracking-ultra text-xl font-medium">FitMeet</p>
          <p className="mt-4 max-w-sm leading-relaxed">
            One Earth. Every body. Every being. A connected wellness ecosystem.
          </p>
        </div>

        <div className="md:col-span-2">
          <p className="text-[10px] tracking-[0.28em] uppercase text-ivory/35 mb-4">
            Ecosystem
          </p>
          <ul className="space-y-2">
            <li><a href="/human" className="hover:text-ivory transition-colors">Human</a></li>
            <li><a href="/pet" className="hover:text-ivory transition-colors">Pet & Animal</a></li>
            <li><a href="/ai" className="hover:text-ivory transition-colors">AI & Robotics</a></li>
          </ul>
        </div>

        <div className="md:col-span-2">
          <p className="text-[10px] tracking-[0.28em] uppercase text-ivory/35 mb-4">Brand</p>
          <ul className="space-y-2">
            <li><a href="#philosophy" className="hover:text-ivory transition-colors">About</a></li>
            <li><a href="#footer" className="hover:text-ivory transition-colors">Contact</a></li>
            <li><a href="#" className="hover:text-ivory transition-colors">Press</a></li>
          </ul>
        </div>

        <div className="md:col-span-2">
          <p className="text-[10px] tracking-[0.28em] uppercase text-ivory/35 mb-4">Legal</p>
          <ul className="space-y-2">
            <li><a href="#" className="hover:text-ivory transition-colors">Privacy</a></li>
            <li><a href="#" className="hover:text-ivory transition-colors">Terms</a></li>
            <li><a href="#" className="hover:text-ivory transition-colors">Cookies</a></li>
          </ul>
        </div>

        <div className="md:col-span-2">
          <p className="text-[10px] tracking-[0.28em] uppercase text-ivory/35 mb-4">Social</p>
          <ul className="space-y-2">
            <li><a href="#" className="hover:text-ivory transition-colors">Instagram</a></li>
            <li><a href="#" className="hover:text-ivory transition-colors">X</a></li>
            <li><a href="#" className="hover:text-ivory transition-colors">YouTube</a></li>
          </ul>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto mt-16 pt-6 border-t hairline flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-ivory/35 text-[11px] tracking-[0.18em] uppercase">
        <span>© {year} FitMeet. All rights reserved.</span>
        <span>Designed for a connected wellness ecosystem.</span>
      </div>
    </footer>
  );
}
