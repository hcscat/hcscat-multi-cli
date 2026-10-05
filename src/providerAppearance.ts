import path from 'node:path';
import * as vscode from 'vscode';
import type { ProviderKind } from './model';

// Packaged provider marks work offline; origins and rights are recorded in THIRD_PARTY_NOTICES.md.
const icons: Partial<Record<ProviderKind, { light: vscode.Uri; dark: vscode.Uri }>> = {};

function icon(kind: ProviderKind): { light: vscode.Uri; dark: vscode.Uri } {
  const media = path.join(__dirname, '..', 'media');
  return {
    light: vscode.Uri.file(path.join(media, `${kind}-light.svg`)),
    dark: vscode.Uri.file(path.join(media, `${kind}-dark.svg`)),
  };
}

export function providerIcon(kind: ProviderKind): { light: vscode.Uri; dark: vscode.Uri } {
  return icons[kind] ??= icon(kind);
}
