/**
 * PDF 法律文书生成器
 * 使用 PDFKit 生成标准格式的劳动仲裁申请书 / 答辩状 等文书
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');

// 注册中文字体（使用系统字体或自备字体）
// 注意：PDFKit 默认不支持中文，需要加载 TTF
const FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
  '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/System/Library/Fonts/PingFang.ttc',
  'C:/Windows/Fonts/msyh.ttc',
  'C:/Windows/Fonts/simhei.ttf'
];

function findChineseFont() {
  for (const fp of FONT_CANDIDATES) {
    if (fs.existsSync(fp)) return fp;
  }
  // fallback：使用服务自带字体
  const localFont = path.join(__dirname, '../../uploads/fonts/NotoSansCJK-Regular.ttc');
  return fs.existsSync(localFont) ? localFont : null;
}

/**
 * 生成劳动仲裁申请书 PDF
 * @param {object} caseData analyzeCase 返回的完整数据
 * @param {object} extra 额外信息 { contact, address, factDetail }
 * @returns {Promise<{path: string, filename: string}>}
 */
function generateArbitrationPdf(caseData, extra = {}) {
  return new Promise((resolve, reject) => {
    const fontPath = findChineseFont();
    if (!fontPath) {
      reject(new Error('未找到中文字体，请在 server/uploads/fonts 下放置 NotoSansCJK-Regular.ttc'));
      return;
    }

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 70, bottom: 70, left: 60, right: 60 }
    });

    const filename = `仲裁申请书_${caseData.basicInfo.userName || '当事人'}_${nanoid(6)}.pdf`;
    const outputPath = path.join(__dirname, '../../uploads', filename);
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // 注册中文字体
    doc.registerFont('CN', fontPath);
    doc.font('CN');

    const { basicInfo, arbitrationRequests, caseTypes, tenure } = caseData;

    // ===== 标题 =====
    doc.fontSize(22).text('劳动仲裁申请书', { align: 'center' });
    doc.moveDown(1);

    // ===== 当事人信息 =====
    doc.fontSize(12);
    doc.text('申请人：', { continued: true });
    doc.text(basicInfo.userName + '  身份证号：____________');
    doc.text('住  址：', { continued: true });
    doc.text(extra.address || '________________________');
    doc.text('电  话：', { continued: true });
    doc.text(extra.contact || '________________________');
    doc.moveDown(0.5);
    doc.text('被申请人：', { continued: true });
    doc.text(basicInfo.companyName + '（全称）');
    doc.text('住  所：', { continued: true });
    doc.text('________________________');
    doc.text('法定代表人：', { continued: true });
    doc.text('________________________');
    doc.moveDown(1);

    // ===== 仲裁请求 =====
    doc.fontSize(14).text('仲裁请求：');
    doc.moveDown(0.3);
    doc.fontSize(12);
    arbitrationRequests.forEach((req, idx) => {
      doc.text(`${idx + 1}. ${req.item}  人民币 ¥${req.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} 元`, { indent: 10 });
      if (req.formula) {
        doc.fontSize(10).fillColor('#666').text(`   计算方式：${req.formula}`, { indent: 10 });
        doc.fillColor('#333').fontSize(12);
      }
      doc.moveDown(0.3);
    });
    doc.moveDown(1);

    // ===== 事实与理由 =====
    doc.fontSize(14).text('事实与理由：');
    doc.moveDown(0.3);
    doc.fontSize(12);

    const typeNames = caseTypes.map(t => t.name).join('、');
    doc.text(
      `申请人于 ${basicInfo.hireDate} 入职被申请人 ${basicInfo.companyName}，` +
      `担任___________岗位，月均工资人民币 ${basicInfo.monthlySalary} 元。` +
      `${basicInfo.endDate ? `于 ${basicInfo.endDate} 被解除劳动关系。` : `目前在职。`}` +
      `累计工作年限约 ${tenure.years} 年 ${tenure.months} 个月。`,
      { lineGap: 6 }
    );
    doc.moveDown(0.5);

    doc.text(`被申请人存在以下违法行为：${typeNames}。`, { lineGap: 6 });
    doc.moveDown(0.3);
    doc.text(
      `根据《中华人民共和国劳动合同法》《中华人民共和国劳动法》等相关法律规定，` +
      `被申请人应当向申请人支付相应的赔偿金。为维护申请人合法权益，特向贵委申请仲裁，` +
      `恳请依法裁决。`,
      { lineGap: 6 }
    );
    doc.moveDown(1);

    // ===== 法律依据 =====
    doc.fontSize(14).text('法律依据：');
    doc.moveDown(0.3);
    doc.fontSize(12);
    const basis = caseData.legalBasis || [];
    basis.forEach((b, i) => doc.text(`${i + 1}. ${b}`, { indent: 10 }));
    doc.moveDown(1);

    // ===== 此致 =====
    doc.text('此致', { align: 'left' });
    doc.moveDown(0.3);
    doc.text('_____市劳动人事争议仲裁委员会', { indent: 20 });
    doc.moveDown(2);

    // ===== 落款 =====
    doc.text('申请人（签名）：________________', { align: 'right' });
    doc.moveDown(0.5);
    doc.text(`日期：${new Date().toLocaleDateString('zh-CN')}`, { align: 'right' });

    doc.end();

    stream.on('finish', () => resolve({ path: outputPath, filename }));
    stream.on('error', reject);
  });
}

/**
 * 生成胜率预测报告（PDF 简版）
 */
function generateWinRateReport(caseData) {
  return new Promise((resolve, reject) => {
    const fontPath = findChineseFont();
    if (!fontPath) { reject(new Error('中文字体缺失')); return; }

    const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 60, left: 50, right: 50 } });
    const filename = `胜率预测报告_${nanoid(6)}.pdf`;
    const outputPath = path.join(__dirname, '../../uploads', filename);
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    doc.registerFont('CN', fontPath);
    doc.font('CN');

    doc.fontSize(20).text('AI 维权胜率预测报告', { align: 'center' });
    doc.fontSize(10).fillColor('#888').text(`生成时间：${new Date().toLocaleString('zh-CN')}`, { align: 'center' });
    doc.fillColor('#333').moveDown(1);

    // 胜率大数字
    doc.fontSize(48).fillColor(caseData.winRate >= 70 ? '#16a34a' : caseData.winRate >= 50 ? '#ca8a04' : '#dc2626')
       .text(`${caseData.winRate}%`, { align: 'center' });
    doc.fontSize(14).fillColor('#333').text('综合胜率预测', { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(13).text('📌 案情识别');
    doc.moveDown(0.3);
    doc.fontSize(11);
    caseData.caseTypes.forEach(t => {
      doc.text(`• ${t.name} — ${t.legalBasis}`, { lineGap: 4 });
    });
    doc.moveDown(0.8);

    doc.fontSize(13).text('💰 预估赔偿');
    doc.moveDown(0.3);
    doc.fontSize(11);
    const total = caseData.compensation.estimatedTotal ||
                  caseData.compensation.scenarios.reduce((s, x) => s + (x.amount || x.amountN1 || x.amountN || 0), 0);
    doc.text(`• 预估总金额：¥${total.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`, { lineGap: 4 });
    caseData.compensation.scenarios.forEach(s => {
      const amt = s.amount ?? s.amountN1 ?? s.amountN;
      if (amt) doc.text(`  - ${s.name}：¥${amt.toLocaleString()}`, { lineGap: 4 });
    });
    doc.moveDown(0.8);

    if (caseData.aiEnhanced) {
      doc.fontSize(13).text('🤖 AI 法律建议');
      doc.moveDown(0.3);
      doc.fontSize(11);
      if (caseData.aiEnhanced.legalAdvice) doc.text(caseData.aiEnhanced.legalAdvice, { lineGap: 5 });
      if (caseData.aiEnhanced.evidenceSuggestions?.length) {
        doc.moveDown(0.3);
        doc.text('建议补充证据：', { lineGap: 4 });
        caseData.aiEnhanced.evidenceSuggestions.forEach(e => doc.text(`• ${e}`, { lineGap: 3 }));
      }
    }

    doc.moveDown(1.5);
    doc.fontSize(9).fillColor('#888')
       .text('本报告由 AI 自动生成，仅供参考，不构成法律意见。具体案情建议咨询专业律师。', { align: 'center' });

    doc.end();
    stream.on('finish', () => resolve({ path: outputPath, filename }));
    stream.on('error', reject);
  });
}

module.exports = { generateArbitrationPdf, generateWinRateReport, findChineseFont };
