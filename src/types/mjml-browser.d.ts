declare module 'mjml-browser' {
  interface MjmlError {
    line: number;
    message: string;
    tagName: string;
    formattedMessage: string;
  }
  interface MjmlOptions {
    validationLevel?: 'strict' | 'soft' | 'skip';
    keepComments?: boolean;
    minify?: boolean;
  }
  interface MjmlResult {
    html: string;
    errors: MjmlError[];
  }
  export default function mjml2html(mjml: string, options?: MjmlOptions): MjmlResult;
}
