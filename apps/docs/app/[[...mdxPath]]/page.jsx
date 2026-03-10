/**
 * Dynamic MDX page renderer for Nextra documentation.
 *
 * @module
 * @category Pages
 */
import { generateStaticParamsFor, importPage } from "nextra/pages";

import { useMDXComponents as getMDXComponents } from "../../mdx-components";

export const generateStaticParams = generateStaticParamsFor("mdxPath");

export const generateMetadata = async (props) => {
  const params = await props.params;
  const { metadata } = await importPage(params.mdxPath);
  return metadata;
};

const Wrapper = getMDXComponents().wrapper;

const Page = async (props) => {
  const params = await props.params;
  const { default: MDXContent, toc, metadata, sourceCode } = await importPage(params.mdxPath);
  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
};

export default Page;
