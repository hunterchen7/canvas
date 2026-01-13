import Head from "next/head";
import { Footer } from "../components/footer";
import Hero from "../components/promo/hero";
import {
  Canvas,
  growTransition,
  DefaultCanvasBackground,
  DefaultIntroContent,
  DefaultWrapperBackground,
  canvasWidth,
  canvasHeight,
} from "@hunterchen/canvas";
import Sponsors from "../components/promo/sponsors";
import About from "../components/promo/about";
import Projects from "../components/promo/projects";
import FAQ from "../components/promo/faq";
import Team from "../components/promo/team";
import { coordinates, navItems } from "../constants/canvas";
import MLHTrustBadge from "../components/promo/mlh-trust.badge";
import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { Button } from "~/components/ui/button";

// Hack Western themed background configuration
const HACK_WESTERN_CANVAS_GRADIENT = `radial-gradient(ellipse ${canvasWidth}px ${canvasHeight}px at ${canvasWidth / 2}px ${canvasHeight}px, var(--coral) 0%, var(--salmon) 41%, var(--lilac) 59%, var(--beige) 90%)`;
const HACK_WESTERN_INTRO_GRADIENT = "linear-gradient(to top, #FEB6AF 0%, var(--canvas-salmon) 15%, var(--canvas-beige) 50%)";
const HACK_WESTERN_BOX_GRADIENT = "radial-gradient(130.38% 95% at 50.03% 97.25%, #EFB8A0 0%, #EAD2DF 48.09%, #EFE3E1 100%)";

export default function Home() {
  const router = useRouter();
  // prefetch register and login
  useEffect(() => {
    void router.prefetch("/register");
    void router.prefetch("/login");
  }, [router]);

  return (
    <>
      <Head>
        <title>Hack Western</title>
        <meta
          name="description"
          content="Hack Western: One of Canada's largest annual student-run hackathons based out of Western University in London, Ontario."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main
        id="home"
        className="relative min-h-screen cursor-[url('/customcursor.svg'),auto]"
      >
        <Canvas
          homeCoordinates={coordinates.home}
          navItems={navItems}
          introBackgroundGradient={HACK_WESTERN_INTRO_GRADIENT}
          canvasBoxGradient={HACK_WESTERN_BOX_GRADIENT}
          introContent={
            <DefaultIntroContent
              logoSrc="/horse.svg"
              logoAlt="Hack Western Logo"
              title="HACK WESTERN 12"
            />
          }
          loadingText="LOADING CANVAS"
          canvasBackground={
            <DefaultCanvasBackground
              gradientStyle={HACK_WESTERN_CANVAS_GRADIENT}
              dotColor="#776780"
            />
          }
          wrapperBackground={
            <DefaultWrapperBackground gradient={HACK_WESTERN_INTRO_GRADIENT} />
          }
        >
          <Hero />
          <Sponsors />
          <About />
          <Projects />
          <FAQ />
          <Team />
        </Canvas>
        <Footer />
        <MLHTrustBadge />
        <Link href="/live" prefetch={true}>
          <motion.div
            className="fixed right-24 top-6 z-50 w-fit md:right-28 lg:right-44"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: growTransition }}
            exit={{ opacity: 0 }}
          >
            <Button variant="primary">Dashboard</Button>
          </motion.div>
        </Link>
      </main>
    </>
  );
}
