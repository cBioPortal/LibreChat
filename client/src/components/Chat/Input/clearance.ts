/**
 * Room the composer band leaves beneath itself from `sm` up. A footer bar sits
 * there whenever `footerBelow` holds, and the band reserves it. With no bar
 * beneath it, the band keeps only enough to
 * clear the surface's own shadow, on the welcome screen as in a conversation.
 * Below `sm` the composer runs to the viewport floor in every state.
 */
export default function composerClearance({
  isLandingPage,
  footerBelow,
}: {
  isLandingPage: boolean;
  footerBelow: boolean;
}): string {
  if (!footerBelow) {
    return 'sm:mb-4';
  }
  return 'sm:mb-10';
}
