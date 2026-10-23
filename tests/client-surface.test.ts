import { describe, expect, it } from 'vitest'
import { isPhoneDevice, NARROW_PHONE_BREAKPOINT, resolveClientSurface, shouldUsePhoneSurface } from '../src/client.js'

const surface = (input: Partial<Parameters<typeof resolveClientSurface>[0]>): string =>
  resolveClientSurface({ protocol: 'http:', hostname: '127.0.0.1', search: '', trustedGateway: false, dedicatedFrontend: undefined, ...input })

describe('client surface selection', () => {
  it('keeps the DSH desktop window on the desktop surface', () => {
    // The official desktop app serves the frontend from its privileged
    // dsh-app://app/ scheme, where the hostname is "app". Deciding by hostname
    // installed the phone DOM layer inside the desktop window.
    expect(surface({ protocol: 'dsh-app:', hostname: 'app' })).toBe('desktop')
  })

  it('keeps the host page on the desktop surface for every loopback spelling', () => {
    expect(surface({ hostname: '127.0.0.1' })).toBe('desktop')
    expect(surface({ hostname: 'localhost' })).toBe('desktop')
    expect(surface({ hostname: '::1' })).toBe('desktop')
    expect(surface({ hostname: '[::1]' })).toBe('desktop')
  })

  it('installs the phone surface on the gateway and remote channels', () => {
    expect(surface({ hostname: '192.168.1.20', trustedGateway: true })).toBe('mobile')
    expect(surface({ hostname: 'phone.tailnet.ts.net', trustedGateway: true })).toBe('mobile')
    // The LAN gateway stamps the frontend marker even where the hostname is odd.
    expect(surface({ protocol: 'dsh-app:', hostname: 'app', dedicatedFrontend: 'dedicated' })).toBe('mobile')
  })

  it('still adapts a page served from some other non-loopback origin', () => {
    expect(surface({ hostname: '192.168.1.20' })).toBe('mobile')
    expect(surface({ hostname: 'phone.tailnet.ts.net' })).toBe('mobile')
  })

  it('honours both explicit markers ahead of the desktop scheme', () => {
    expect(surface({ protocol: 'dsh-app:', hostname: 'app', trustedGateway: true })).toBe('mobile')
    expect(surface({ protocol: 'dsh-app:', hostname: 'app', dedicatedFrontend: 'dedicated' })).toBe('mobile')
  })

  it('keeps ?dsh-on-phone-preview as a phone preview inside the host page', () => {
    expect(surface({ protocol: 'dsh-app:', hostname: 'app', search: '?dsh-on-phone-preview' })).toBe('mobile')
    expect(surface({ search: '?foo=1&dsh-on-phone-preview=1' })).toBe('mobile')
    // The pre-rename spelling still opens the phone preview.
    expect(surface({ protocol: 'dsh-app:', hostname: 'app', search: '?dsh-mobile-preview' })).toBe('mobile')
  })

  it('does not treat an unrelated marker value as the gateway frontend', () => {
    expect(surface({ protocol: 'dsh-app:', hostname: 'app', dedicatedFrontend: 'stock' })).toBe('desktop')
  })

  it('requires an actual touch device before installing the phone layer', () => {
    // A desktop browser reaching DSH through the gateway/tailscale origin is
    // still a desktop: fine pointer, hover available. The origin heuristic
    // alone installed the density layer inside that browser after a restart.
    const desktopBrowser = (q: string): boolean => !(q === '(hover: none)' || q === '(pointer: coarse)')
    expect(isPhoneDevice(desktopBrowser)).toBe(false)
    // Phone: no hover, coarse (finger) pointer.
    const phone = (q: string): boolean => q === '(hover: none)' || q === '(pointer: coarse)'
    expect(isPhoneDevice(phone)).toBe(true)
    // Touch-screen laptop: hover exists -> still desktop.
    const touchscreenLaptop = (q: string): boolean => q === '(pointer: coarse)'
    expect(isPhoneDevice(touchscreenLaptop)).toBe(false)
  })

  it('serves the phone layer to narrow web windows but never to the desktop shell', () => {
    const fine = (q: string): boolean => !(q === '(hover: none)' || q === '(pointer: coarse)')
    const call = (over: Partial<Parameters<typeof shouldUsePhoneSurface>[0]>): boolean =>
      shouldUsePhoneSurface({ surface: 'mobile', preview: false, width: 1600, protocol: 'http:', query: fine, ...over })
    // A desktop browser in a narrow window gets the phone layer: the stock
    // narrow mode clips buttons and covers the viewport.
    expect(call({ surface: 'desktop', width: NARROW_PHONE_BREAKPOINT - 1 })).toBe(true)
    expect(call({ surface: 'desktop', width: NARROW_PHONE_BREAKPOINT })).toBe(false)
    // The privileged desktop shell keeps its chrome at any width.
    expect(call({ surface: 'desktop', protocol: 'dsh-app:', width: NARROW_PHONE_BREAKPOINT - 1 })).toBe(false)
    // Touch devices and the preview hatch stay phone, at any width.
    const coarse = (q: string): boolean => q === '(hover: none)' || q === '(pointer: coarse)'
    expect(call({ query: coarse, width: 1600 })).toBe(true)
    expect(call({ preview: true, width: 1600, protocol: 'dsh-app:' })).toBe(true)
  })
})
