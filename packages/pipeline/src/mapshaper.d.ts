declare module 'mapshaper' {
  const mapshaper: {
    /** Run mapshaper commands on in-memory inputs; resolves to output file name → contents. */
    applyCommands(commands: string, input: Record<string, string>): Promise<Record<string, string | Uint8Array>>
  }
  export default mapshaper
}
