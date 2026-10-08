import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { areaDo, usuarioAtual } from "@/server/auth";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const u = await usuarioAtual();
  return (
    <>
      <Header area={u ? areaDo(u.papel) : null} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
