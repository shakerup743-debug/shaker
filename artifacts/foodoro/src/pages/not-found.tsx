import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <p className="text-6xl font-black text-primary/30">404</p>
      <h1 className="text-xl font-bold text-foreground mt-2">Page not found</h1>
      <Link href="/">
        <button className="mt-4 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
          Go to POS
        </button>
      </Link>
    </div>
  );
}
