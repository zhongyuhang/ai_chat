import { AlignmentType, Document, Footer, HeadingLevel, PageBreak, PageNumber, Packer, Paragraph, TextRun } from 'docx';
import type { Manuscript } from './manuscript-model.js';

function bodyParagraphs(markdown: string) {
  const body = markdown.replace(/^#{1,6}\s+[^\n]+\n+/u, '').trim();
  return body.split(/\n\s*\n/gu).filter(Boolean).map((text) => new Paragraph({ indent: { firstLine: 480 }, spacing: { line: 420, after: 120 }, children: [new TextRun(text.replace(/[*_~`]+/gu, ''))] }));
}

export async function renderDocx(manuscript: Manuscript): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: manuscript.project.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { before: 2400, after: 600 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'AI 小说工作台正式稿导出', italics: true })] }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
  manuscript.volumes.forEach((volume, volumeIndex) => {
    if (volumeIndex > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ text: volume.title, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }));
    for (const chapter of volume.chapters) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(new Paragraph({ text: chapter.title, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, spacing: { after: 480 } }));
      children.push(...bodyParagraphs(chapter.content));
    }
  });
  const document = new Document({
    styles: { default: { document: { run: { font: '宋体', size: 24 }, paragraph: { spacing: { line: 420 } } } } },
    sections: [{ properties: {}, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }) }, children }],
  });
  return Packer.toBuffer(document);
}
