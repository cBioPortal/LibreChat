import composerClearance from '../clearance';

describe('composerClearance', () => {
  test('reserves the footer band on the welcome screen', () => {
    expect(composerClearance({ isLandingPage: true, footerBelow: true })).toBe('sm:mb-10');
  });

  test('drops the footer band on a welcome screen with no footer beneath it', () => {
    expect(composerClearance({ isLandingPage: true, footerBelow: false })).toBe('sm:mb-4');
    expect(composerClearance({ isLandingPage: true, footerBelow: false })).toBe('sm:mb-4');
  });

  test('reserves the band in a conversation only for a configured footer', () => {
    expect(composerClearance({ isLandingPage: false, footerBelow: true })).toBe('sm:mb-10');
    expect(composerClearance({ isLandingPage: false, footerBelow: false })).toBe('sm:mb-4');
  });
});
