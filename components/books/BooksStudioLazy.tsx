"use client";

// Client-only entry point for Books. AG Studio touches the DOM while loading, so it is never rendered
// on the server.
//
//   import BooksStudio from "@/components/books/BooksStudioLazy";
//   <BooksStudio ws={workspace} className="h-full" />

import dynamic from "next/dynamic";
import type { BooksStudioProps } from "./BooksStudio";

const BooksStudio = dynamic(() => import("./BooksStudio"), {
  ssr: false,
  loading: () => <div className="bk-loading">Opening the books</div>,
});

export default function BooksStudioLazy(props: BooksStudioProps) {
  return <BooksStudio {...props} />;
}

export type { BooksStudioProps };
