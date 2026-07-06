const fs = require('fs');
const path = require('path');

const indexFile = 'c:\\Users\\LENOVO\\OneDrive\\Cz\\โปรแกรมศูนย์ให้คำปรึกษา\\Index.html';
const stylesFile = 'c:\\Users\\LENOVO\\OneDrive\\Cz\\โปรแกรมศูนย์ให้คำปรึกษา\\Styles.html';

// 1. Read Index.html
let indexContent = fs.readFileSync(indexFile, 'utf8');

// Update all M90 sheets to include class 'm90-sheet' and adjust padding/font-size
// Let's replace the page containers and restructure
// Let's find: <!-- 2. หน้า ม.90 (5 แผ่นงาน) -->
// We can locate the start and end of this block.
const m90StartTag = "<!-- 2. หน้า ม.90 (5 แผ่นงาน) -->";
const m90StartIndex = indexContent.indexOf(m90StartTag);
if (m90StartIndex === -1) {
  console.error("Could not find M90 start comment!");
  process.exit(1);
}

// Let's find the closing div of this block which is followed by </div><!-- 3. หน้า ม.132 --> or similar.
// Let's search for next block start
const nextBlockTag = "<!-- 3. หน้า ม.132";
const nextBlockIndex = indexContent.indexOf(nextBlockTag);
if (nextBlockIndex === -1) {
  console.error("Could not find next block start comment!");
  process.exit(1);
}

// Let's extract the exact substring for M90
// The closing div of monthlyReport.activeTab === 'm90' container
const m90Substr = indexContent.substring(m90StartIndex, nextBlockIndex);

// Let's construct the new M90 block
const newM90Block = `<!-- 2. หน้า ม.90 (5 แผ่นงาน) -->
            <div v-else-if="monthlyReport.activeTab === 'm90'" style="display: flex; flex-direction: column; gap: 30px;">
              
              <!-- แผ่นที่ 1: ข้อหา 1 - 8 (ข้อ 1 ถึง 27) -->
              <div class="a4-sheet m90-sheet" style="font-family: 'Sarabun', 'TH Sarabun PSK', sans-serif; padding: 8mm 12mm !important; font-size: 0.68rem !important; color: #000; line-height: 1.15; background-color: #fff; page-break-after: always; box-sizing: border-box; border-radius: 0; box-shadow: none; border: none; min-height: 296.5mm; height: 296.5mm; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-start; gap: 3px;">
                <div style="text-align: center; font-size: 0.6rem; margin-bottom: 2px; color: #000; font-weight: normal;">หน้าที่ 1</div>
                
                <!-- หัวกระดาษคาดกล่องตาราง -->
                <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; font-family: 'Sarabun', 'TH Sarabun PSK', sans-serif;">
                  <tr>
                    <td style="border-right: 1.5px solid #000; padding: 5px 8px; text-align: center; font-weight: bold; width: 83%; font-size: 15px; color: #000;">
                      แบบรายงานมาตรการพิเศษแทนการดำเนินคดีอาญา / ผลการปฏิบัติตาม มาตรการพิเศษแทนการดำเนินคดีอาญา
                    </td>
                    <td style="padding: 5px 8px; text-align: center; font-weight: bold; width: 17%; font-size: 16px; color: #000; background-color: #fff;">
                      ชั้นศาล(ม.90)
                    </td>
                  </tr>
                </table>
                <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-top: 2px; margin-bottom: 3px; font-family: 'Sarabun', 'TH Sarabun PSK', sans-serif;">
                  <tr>
                    <td rowspan="2" style="border-right: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 3px 6px; text-align: center; font-weight: bold; width: 48%; font-size: 13px; color: #000; vertical-align: middle;">
                      ประจำเดือน {{ thaiMonths[monthlyReport.selectedMonth - 1] }} พ.ศ. {{ monthlyReport.selectedYear }}
                    </td>
                    <td style="border-bottom: 1px solid #000; padding: 2px 6px; font-size: 13px; color: #000; line-height: 1.2; width: 52%; text-align: left; vertical-align: middle;">
                      <div style="display: flex; align-items: center;">
                        <div style="width: 11px; height: 11px; border: 1.2px solid #000; display: inline-flex; align-items: center; justify-content: center; margin-right: 6px; font-size: 8px; font-weight: bold; flex-shrink: 0; background: #fff; line-height: 1;">✓</div>
                        <span>ศาลเยาวชนและครอบครัวจังหวัดระยอง</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 2px 6px; border-bottom: 1.5px solid #000; font-size: 13px; color: #000; line-height: 1.2; text-align: left; vertical-align: middle;">
                      <div style="display: flex; align-items: center;">
                        <div style="width: 11px; height: 11px; border: 1.2px solid #000; display: inline-flex; align-items: center; justify-content: center; margin-right: 6px; flex-shrink: 0; background: #fff;"></div>
                        <span>ศาลจังหวัด....................... แผนกคดีเยาวชนและครอบครัว</span>
                      </div>
                    </td>
                  </tr>
                </table>

                <div style="font-weight: bold; font-size: 0.68rem; margin-bottom: 2px; color: #000;">ความผิดตามประมวลกฎหมายอาญา</div>
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.58rem; text-align: center;">
                  <thead>
                    <tr style="background-color: #f1f5f9; border-bottom: 1px solid #000; font-weight: bold;">
                      <th rowspan="2" style="border: 1px solid #000; padding: 2px 3px; text-align: left; width: 48%; vertical-align: middle;">ข้อหา</th>
                      <th colspan="3" style="border: 1px solid #000; padding: 2px 3px; vertical-align: middle;">แผนแก้ไขบำบัดฟื้นฟู</th>
                      <th rowspan="2" style="border: 1px solid #000; padding: 2px 3px; width: 13%; vertical-align: middle;">รวม</th>
                    </tr>
                    <tr style="background-color: #f1f5f9; border-bottom: 1px solid #000; font-weight: bold;">
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 13%;">ศาลไม่เห็นชอบด้วยกับแผนฯ</th>
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 13%;">ปฏิบัติตามแผนฯครบถ้วน</th>
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 13%;">ปฏิบัติตามแผนฯไม่ครบถ้วน</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="c in monthlyReport.charges" :key="c.charge_no">
                      <tr v-if="c.charge_no >= 1 && c.charge_no <= 27" :style="isCategoryHeader(c.charge_no) ? { backgroundColor: '#f8fafc', fontWeight: 'bold' } : {}">
                        <td style="border: 1px solid #000; padding: 2px 3px; text-align: left;" :style="!isCategoryHeader(c.charge_no) ? { paddingLeft: '12px' } : {}">
                          {{ c.charge_statistics_no ? c.charge_statistics_no + (isCategoryHeader(c.charge_no) ? '. ' : ' ') : '' }}{{ c.charge_statistics }}
                        </td>
                        <template v-if="isCategoryHeader(c.charge_no)">
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', c.charge_no, 1) || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', c.charge_no, 2) || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', c.charge_no, 3) || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px; font-weight: bold; background-color: #f1f5f9;">{{ getRowTotal('m90', c.charge_no) || '' }}</td>
                        </template>
                        <template v-else>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['m90_c' + c.charge_no + '_1'] || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['m90_c' + c.charge_no + '_2'] || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['m90_c' + c.charge_no + '_3'] || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px; font-weight: bold; background-color: #f8fafc;">{{ getRowTotal('m90', c.charge_no) || '' }}</td>
                        </template>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- แผ่นที่ 2: ข้อหา 9 - 17 (ข้อ 28 ถึง 59) -->
              <div class="a4-sheet m90-sheet" style="font-family: 'Sarabun', 'TH Sarabun PSK', sans-serif; padding: 8mm 12mm !important; font-size: 0.68rem !important; color: #000; line-height: 1.15; background-color: #fff; page-break-after: always; box-sizing: border-box; border-radius: 0; box-shadow: none; border: none; min-height: 296.5mm; height: 296.5mm; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-start; gap: 3px;">
                <div style="text-align: center; font-size: 0.6rem; margin-bottom: 2px; color: #000; font-weight: normal;">หน้าที่ 2</div>
                
                <!-- หัวกระดาษคาดกล่องตาราง -->
                <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; font-family: 'Sarabun', 'TH Sarabun PSK', sans-serif;">
                  <tr>
                    <td style="border-right: 1.5px solid #000; padding: 5px 8px; text-align: center; font-weight: bold; width: 83%; font-size: 15px; color: #000;">
                      แบบรายงานมาตรการพิเศษแทนการดำเนินคดีอาญา / ผลการปฏิบัติตาม มาตรการพิเศษแทนการดำเนินคดีอาญา
                    </td>
                    <td style="padding: 5px 8px; text-align: center; font-weight: bold; width: 17%; font-size: 16px; color: #000; background-color: #fff;">
                      ชั้นศาล(ม.90)
                    </td>
                  </tr>
                </table>
                <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-top: 2px; margin-bottom: 3px; font-family: 'Sarabun', 'TH Sarabun PSK', sans-serif;">
                  <tr>
                    <td rowspan="2" style="border-right: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 3px 6px; text-align: center; font-weight: bold; width: 48%; font-size: 13px; color: #000; vertical-align: middle;">
                      ประจำเดือน {{ thaiMonths[monthlyReport.selectedMonth - 1] }} พ.ศ. {{ monthlyReport.selectedYear }}
                    </td>
                    <td style="border-bottom: 1px solid #000; padding: 2px 6px; font-size: 13px; color: #000; line-height: 1.2; width: 52%; text-align: left; vertical-align: middle;">
                      <div style="display: flex; align-items: center;">
                        <div style="width: 11px; height: 11px; border: 1.2px solid #000; display: inline-flex; align-items: center; justify-content: center; margin-right: 6px; font-size: 8px; font-weight: bold; flex-shrink: 0; background: #fff; line-height: 1;">✓</div>
                        <span>ศาลเยาวชนและครอบครัวจังหวัดระยอง</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 2px 6px; border-bottom: 1.5px solid #000; font-size: 13px; color: #000; line-height: 1.2; text-align: left; vertical-align: middle;">
                      <div style="display: flex; align-items: center;">
                        <div style="width: 11px; height: 11px; border: 1.2px solid #000; display: inline-flex; align-items: center; justify-content: center; margin-right: 6px; flex-shrink: 0; background: #fff;"></div>
                        <span>ศาลจังหวัด....................... แผนกคดีเยาวชนและครอบครัว</span>
                      </div>
                    </td>
                  </tr>
                </table>

                <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.58rem; text-align: center;">
                  <thead>
                    <tr style="background-color: #f1f5f9; border-bottom: 1px solid #000; font-weight: bold;">
                      <th rowspan="2" style="border: 1px solid #000; padding: 2px 3px; text-align: left; width: 48%; vertical-align: middle;">ข้อหา</th>
                      <th colspan="3" style="border: 1px solid #000; padding: 2px 3px; vertical-align: middle;">แผนแก้ไขบำบัดฟื้นฟู</th>
                      <th rowspan="2" style="border: 1px solid #000; padding: 2px 3px; width: 13%; vertical-align: middle;">รวม</th>
                    </tr>
                    <tr style="background-color: #f1f5f9; border-bottom: 1px solid #000; font-weight: bold;">
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 13%;">ศาลไม่เห็นชอบด้วยกับแผนฯ</th>
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 13%;">ปฏิบัติตามแผนฯครบถ้วน</th>
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 13%;">ปฏิบัติตามแผนฯไม่ครบถ้วน</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="c in monthlyReport.charges" :key="c.charge_no">
                      <tr v-if="c.charge_no >= 28 && c.charge_no <= 59" :style="isCategoryHeader(c.charge_no) ? { backgroundColor: '#f8fafc', fontWeight: 'bold' } : {}">
                        <td style="border: 1px solid #000; padding: 2px 3px; text-align: left;" :style="!isCategoryHeader(c.charge_no) ? { paddingLeft: '12px' } : {}">
                          {{ c.charge_statistics_no ? c.charge_statistics_no + (isCategoryHeader(c.charge_no) ? '. ' : ' ') : '' }}{{ c.charge_statistics }}
                        </td>
                        <template v-if="isCategoryHeader(c.charge_no)">
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', c.charge_no, 1) || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', c.charge_no, 2) || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', c.charge_no, 3) || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px; font-weight: bold; background-color: #f1f5f9;">{{ getRowTotal('m90', c.charge_no) || '' }}</td>
                        </template>
                        <template v-else>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['m90_c' + c.charge_no + '_1'] || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['m90_c' + c.charge_no + '_2'] || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['m90_c' + c.charge_no + '_3'] || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px; font-weight: bold; background-color: #f8fafc;">{{ getRowTotal('m90', c.charge_no) || '' }}</td>
                        </template>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- แผ่นที่ 3: ข้อหา พ.ร.บ. อาวุธปืน + ยาเสพติดบางส่วน (ข้อ 80, 81-89, 60, 61, 62, 90-104) -->
              <div class="a4-sheet m90-sheet" style="font-family: 'Sarabun', 'TH Sarabun PSK', sans-serif; padding: 8mm 12mm !important; font-size: 0.68rem !important; color: #000; line-height: 1.15; background-color: #fff; page-break-after: always; box-sizing: border-box; border-radius: 0; box-shadow: none; border: none; min-height: 296.5mm; height: 296.5mm; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-start; gap: 3px;">
                <div style="text-align: center; font-size: 0.6rem; margin-bottom: 2px; color: #000; font-weight: normal;">หน้าที่ 3</div>
                
                <!-- หัวกระดาษคาดกล่องตาราง -->
                <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; font-family: 'Sarabun', 'TH Sarabun PSK', sans-serif;">
                  <tr>
                    <td style="border-right: 1.5px solid #000; padding: 5px 8px; text-align: center; font-weight: bold; width: 83%; font-size: 15px; color: #000;">
                      แบบรายงานมาตรการพิเศษแทนการดำเนินคดีอาญา / ผลการปฏิบัติตาม มาตรการพิเศษแทนการดำเนินคดีอาญา
                    </td>
                    <td style="padding: 5px 8px; text-align: center; font-weight: bold; width: 17%; font-size: 16px; color: #000; background-color: #fff;">
                      ชั้นศาล(ม.90)
                    </td>
                  </tr>
                </table>
                <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-top: 2px; margin-bottom: 3px; font-family: 'Sarabun', 'TH Sarabun PSK', sans-serif;">
                  <tr>
                    <td rowspan="2" style="border-right: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 3px 6px; text-align: center; font-weight: bold; width: 48%; font-size: 13px; color: #000; vertical-align: middle;">
                      ประจำเดือน {{ thaiMonths[monthlyReport.selectedMonth - 1] }} พ.ศ. {{ monthlyReport.selectedYear }}
                    </td>
                    <td style="border-bottom: 1px solid #000; padding: 2px 6px; font-size: 13px; color: #000; line-height: 1.2; width: 52%; text-align: left; vertical-align: middle;">
                      <div style="display: flex; align-items: center;">
                        <div style="width: 11px; height: 11px; border: 1.2px solid #000; display: inline-flex; align-items: center; justify-content: center; margin-right: 6px; font-size: 8px; font-weight: bold; flex-shrink: 0; background: #fff; line-height: 1;">✓</div>
                        <span>ศาลเยาวชนและครอบครัวจังหวัดระยอง</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 2px 6px; border-bottom: 1.5px solid #000; font-size: 13px; color: #000; line-height: 1.2; text-align: left; vertical-align: middle;">
                      <div style="display: flex; align-items: center;">
                        <div style="width: 11px; height: 11px; border: 1.2px solid #000; display: inline-flex; align-items: center; justify-content: center; margin-right: 6px; flex-shrink: 0; background: #fff;"></div>
                        <span>ศาลจังหวัด....................... แผนกคดีเยาวชนและครอบครัว</span>
                      </div>
                    </td>
                  </tr>
                </table>

                <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.58rem; text-align: center;">
                  <thead>
                    <tr style="background-color: #f1f5f9; border-bottom: 1px solid #000; font-weight: bold;">
                      <th rowspan="2" style="border: 1px solid #000; padding: 2px 3px; text-align: left; width: 48%; vertical-align: middle;">ข้อหา</th>
                      <th colspan="3" style="border: 1px solid #000; padding: 2px 3px; vertical-align: middle;">แผนแก้ไขบำบัดฟื้นฟู</th>
                      <th rowspan="2" style="border: 1px solid #000; padding: 2px 3px; width: 13%; vertical-align: middle;">รวม</th>
                    </tr>
                    <tr style="background-color: #f1f5f9; border-bottom: 1px solid #000; font-weight: bold;">
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 13%;">ศาลไม่เห็นชอบด้วยกับแผนฯ</th>
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 13%;">ปฏิบัติตามแผนฯครบถ้วน</th>
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 13%;">ปฏิบัติตามแผนฯไม่ครบถ้วน</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="c in monthlyReport.charges" :key="c.charge_no">
                      <tr v-if="c.charge_no === 80 || (c.charge_no >= 81 && c.charge_no <= 89) || c.charge_no === 60 || c.charge_no === 61 || c.charge_no === 62 || (c.charge_no >= 90 && c.charge_no <= 104)" :style="isCategoryHeader(c.charge_no) ? { backgroundColor: '#f8fafc', fontWeight: 'bold' } : {}">
                        <td style="border: 1px solid #000; padding: 2px 3px; text-align: left;" :style="!isCategoryHeader(c.charge_no) ? { paddingLeft: '12px' } : {}">
                          {{ c.charge_statistics_no ? c.charge_statistics_no + (isCategoryHeader(c.charge_no) ? '. ' : ' ') : '' }}{{ c.charge_statistics }}
                        </td>
                        <template v-if="isCategoryHeader(c.charge_no)">
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', c.charge_no, 1) || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', c.charge_no, 2) || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', c.charge_no, 3) || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px; font-weight: bold; background-color: #f1f5f9;">{{ getRowTotal('m90', c.charge_no) || '' }}</td>
                        </template>
                        <template v-else>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['m90_c' + c.charge_no + '_1'] || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['m90_c' + c.charge_no + '_2'] || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['m90_c' + c.charge_no + '_3'] || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px; font-weight: bold; background-color: #f8fafc;">{{ getRowTotal('m90', c.charge_no) || '' }}</td>
                        </template>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- แผ่นที่ 4: ยาเสพติดส่วนที่เหลือ + ความผิดตาม พ.ร.บ. อื่นๆ (ข้อ 105-119, 63, 64-79) -->
              <div class="a4-sheet m90-sheet" style="font-family: 'Sarabun', 'TH Sarabun PSK', sans-serif; padding: 8mm 12mm !important; font-size: 0.68rem !important; color: #000; line-height: 1.15; background-color: #fff; page-break-after: always; box-sizing: border-box; border-radius: 0; box-shadow: none; border: none; min-height: 296.5mm; height: 296.5mm; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-start; gap: 3px;">
                <div style="text-align: center; font-size: 0.6rem; margin-bottom: 2px; color: #000; font-weight: normal;">หน้าที่ 4</div>
                
                <!-- หัวกระดาษคาดกล่องตาราง -->
                <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; font-family: 'Sarabun', 'TH Sarabun PSK', sans-serif;">
                  <tr>
                    <td style="border-right: 1.5px solid #000; padding: 5px 8px; text-align: center; font-weight: bold; width: 83%; font-size: 15px; color: #000;">
                      แบบรายงานมาตรการพิเศษแทนการดำเนินคดีอาญา / ผลการปฏิบัติตาม มาตรการพิเศษแทนการดำเนินคดีอาญา
                    </td>
                    <td style="padding: 5px 8px; text-align: center; font-weight: bold; width: 17%; font-size: 16px; color: #000; background-color: #fff;">
                      ชั้นศาล(ม.90)
                    </td>
                  </tr>
                </table>
                <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-top: 2px; margin-bottom: 3px; font-family: 'Sarabun', 'TH Sarabun PSK', sans-serif;">
                  <tr>
                    <td rowspan="2" style="border-right: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 3px 6px; text-align: center; font-weight: bold; width: 48%; font-size: 13px; color: #000; vertical-align: middle;">
                      ประจำเดือน {{ thaiMonths[monthlyReport.selectedMonth - 1] }} พ.ศ. {{ monthlyReport.selectedYear }}
                    </td>
                    <td style="border-bottom: 1px solid #000; padding: 2px 6px; font-size: 13px; color: #000; line-height: 1.2; width: 52%; text-align: left; vertical-align: middle;">
                      <div style="display: flex; align-items: center;">
                        <div style="width: 11px; height: 11px; border: 1.2px solid #000; display: inline-flex; align-items: center; justify-content: center; margin-right: 6px; font-size: 8px; font-weight: bold; flex-shrink: 0; background: #fff; line-height: 1;">✓</div>
                        <span>ศาลเยาวชนและครอบครัวจังหวัดระยอง</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 2px 6px; border-bottom: 1.5px solid #000; font-size: 13px; color: #000; line-height: 1.2; text-align: left; vertical-align: middle;">
                      <div style="display: flex; align-items: center;">
                        <div style="width: 11px; height: 11px; border: 1.2px solid #000; display: inline-flex; align-items: center; justify-content: center; margin-right: 6px; flex-shrink: 0; background: #fff;"></div>
                        <span>ศาลจังหวัด....................... แผนกคดีเยาวชนและครอบครัว</span>
                      </div>
                    </td>
                  </tr>
                </table>

                <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.58rem; text-align: center;">
                  <thead>
                    <tr style="background-color: #f1f5f9; border-bottom: 1px solid #000; font-weight: bold;">
                      <th rowspan="2" style="border: 1px solid #000; padding: 2px 3px; text-align: left; width: 48%; vertical-align: middle;">ข้อหา</th>
                      <th colspan="3" style="border: 1px solid #000; padding: 2px 3px; vertical-align: middle;">แผนแก้ไขบำบัดฟื้นฟู</th>
                      <th rowspan="2" style="border: 1px solid #000; padding: 2px 3px; width: 13%; vertical-align: middle;">รวม</th>
                    </tr>
                    <tr style="background-color: #f1f5f9; border-bottom: 1px solid #000; font-weight: bold;">
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 13%;">ศาลไม่เห็นชอบด้วยกับแผนฯ</th>
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 13%;">ปฏิบัติตามแผนฯครบถ้วน</th>
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 13%;">ปฏิบัติตามแผนฯไม่ครบถ้วน</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="c in monthlyReport.charges" :key="c.charge_no">
                      <tr v-if="(c.charge_no >= 105 && c.charge_no <= 119) || c.charge_no === 63 || (c.charge_no >= 64 && c.charge_no <= 79)" :style="isCategoryHeader(c.charge_no) ? { backgroundColor: '#f8fafc', fontWeight: 'bold' } : {}">
                        <td style="border: 1px solid #000; padding: 2px 3px; text-align: left;" :style="!isCategoryHeader(c.charge_no) ? { paddingLeft: '12px' } : {}">
                          {{ c.charge_statistics_no ? c.charge_statistics_no + (isCategoryHeader(c.charge_no) ? '. ' : ' ') : '' }}{{ c.charge_statistics }}
                        </td>
                        <template v-if="isCategoryHeader(c.charge_no)">
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', c.charge_no, 1) || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', c.charge_no, 2) || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', c.charge_no, 3) || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px; font-weight: bold; background-color: #f1f5f9;">{{ getRowTotal('m90', c.charge_no) || '' }}</td>
                        </template>
                        <template v-else>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['m90_c' + c.charge_no + '_1'] || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['m90_c' + c.charge_no + '_2'] || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['m90_c' + c.charge_no + '_3'] || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px; font-weight: bold; background-color: #f8fafc;">{{ getRowTotal('m90', c.charge_no) || '' }}</td>
                        </template>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- แผ่นที่ 5: ข้อหาอื่นนอกเหนือจากบัญชี + รวมทั้งสิ้น + ตารางผู้เสียหายไม่ยินยอม + ลายเซ็น -->
              <div class="a4-sheet m90-sheet" style="font-family: 'Sarabun', 'TH Sarabun PSK', sans-serif; padding: 8mm 12mm !important; font-size: 0.68rem !important; color: #000; line-height: 1.15; background-color: #fff; box-sizing: border-box; border-radius: 0; box-shadow: none; border: none; min-height: 296.5mm; height: 296.5mm; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-start; gap: 3px;">
                <div style="text-align: center; font-size: 0.6rem; margin-bottom: 2px; color: #000; font-weight: normal;">หน้าที่ 5</div>
                
                <!-- หัวกระดาษคาดกล่องตาราง -->
                <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; font-family: 'Sarabun', 'TH Sarabun PSK', sans-serif;">
                  <tr>
                    <td style="border-right: 1.5px solid #000; padding: 5px 8px; text-align: center; font-weight: bold; width: 83%; font-size: 15px; color: #000;">
                      แบบรายงานมาตรการพิเศษแทนการดำเนินคดีอาญา / ผลการปฏิบัติตาม มาตรการพิเศษแทนการดำเนินคดีอาญา
                    </td>
                    <td style="padding: 5px 8px; text-align: center; font-weight: bold; width: 17%; font-size: 16px; color: #000; background-color: #fff;">
                      ชั้นศาล(ม.90)
                    </td>
                  </tr>
                </table>
                <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-top: 2px; margin-bottom: 3px; font-family: 'Sarabun', 'TH Sarabun PSK', sans-serif;">
                  <tr>
                    <td rowspan="2" style="border-right: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 3px 6px; text-align: center; font-weight: bold; width: 48%; font-size: 13px; color: #000; vertical-align: middle;">
                      ประจำเดือน {{ thaiMonths[monthlyReport.selectedMonth - 1] }} พ.ศ. {{ monthlyReport.selectedYear }}
                    </td>
                    <td style="border-bottom: 1px solid #000; padding: 2px 6px; font-size: 13px; color: #000; line-height: 1.2; width: 52%; text-align: left; vertical-align: middle;">
                      <div style="display: flex; align-items: center;">
                        <div style="width: 11px; height: 11px; border: 1.2px solid #000; display: inline-flex; align-items: center; justify-content: center; margin-right: 6px; font-size: 8px; font-weight: bold; flex-shrink: 0; background: #fff; line-height: 1;">✓</div>
                        <span>ศาลเยาวชนและครอบครัวจังหวัดระยอง</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 2px 6px; border-bottom: 1.5px solid #000; font-size: 13px; color: #000; line-height: 1.2; text-align: left; vertical-align: middle;">
                      <div style="display: flex; align-items: center;">
                        <div style="width: 11px; height: 11px; border: 1.2px solid #000; display: inline-flex; align-items: center; justify-content: center; margin-right: 6px; flex-shrink: 0; background: #fff;"></div>
                        <span>ศาลจังหวัด....................... แผนกคดีเยาวชนและครอบครัว</span>
                      </div>
                    </td>
                  </tr>
                </table>

                <!-- ตารางหลักส่วนสุดท้าย และรวมทั้งสิ้น -->
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.58rem; text-align: center; margin-bottom: 4px;">
                  <thead>
                    <tr style="background-color: #f1f5f9; border-bottom: 1px solid #000; font-weight: bold;">
                      <th rowspan="2" style="border: 1px solid #000; padding: 2px 3px; text-align: left; width: 48%; vertical-align: middle;">ข้อหา</th>
                      <th colspan="3" style="border: 1px solid #000; padding: 2px 3px; vertical-align: middle;">แผนแก้ไขบำบัดฟื้นฟู</th>
                      <th rowspan="2" style="border: 1px solid #000; padding: 2px 3px; width: 13%; vertical-align: middle;">รวม</th>
                    </tr>
                    <tr style="background-color: #f1f5f9; border-bottom: 1px solid #000; font-weight: bold;">
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 13%;">ศาลไม่เห็นชอบด้วยกับแผนฯ</th>
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 13%;">ปฏิบัติตามแผนฯครบถ้วน</th>
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 13%;">ปฏิบัติตามแผนฯไม่ครบถ้วน</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="c in monthlyReport.charges" :key="c.charge_no">
                      <tr v-if="c.charge_no === 120 || (c.charge_no >= 121 && c.charge_no <= 131)" :style="isCategoryHeader(c.charge_no) ? { backgroundColor: '#f8fafc', fontWeight: 'bold' } : {}">
                        <td style="border: 1px solid #000; padding: 2px 3px; text-align: left;" :style="!isCategoryHeader(c.charge_no) ? { paddingLeft: '12px' } : {}">
                          {{ c.charge_statistics_no ? c.charge_statistics_no + (isCategoryHeader(c.charge_no) ? '. ' : ' ') : '' }}{{ c.charge_statistics }}
                        </td>
                        <template v-if="isCategoryHeader(c.charge_no)">
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', c.charge_no, 1) || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', c.charge_no, 2) || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', c.charge_no, 3) || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px; font-weight: bold; background-color: #f1f5f9;">{{ getRowTotal('m90', c.charge_no) || '' }}</td>
                        </template>
                        <template v-else>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['m90_c' + c.charge_no + '_1'] || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['m90_c' + c.charge_no + '_2'] || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['m90_c' + c.charge_no + '_3'] || '' }}</td>
                          <td style="border: 1px solid #000; padding: 2px 3px; font-weight: bold; background-color: #f8fafc;">{{ getRowTotal('m90', c.charge_no) || '' }}</td>
                        </template>
                      </tr>
                    </template>
                    <tr style="font-weight: bold; background-color: #f1f5f9;">
                      <td style="border: 1px solid #000; padding: 2px 3px; text-align: left;">ความผิดตามประมวลกฎหมายอาญา (ข้อ 1 - 20)</td>
                      <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCriminalCodeTotal('m90', 1) || '' }}</td>
                      <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCriminalCodeTotal('m90', 2) || '' }}</td>
                      <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCriminalCodeTotal('m90', 3) || '' }}</td>
                      <td style="border: 1px solid #000; padding: 2px 3px; font-weight: bold; background-color: #cbd5e1;">{{ getCriminalCodeRowTotal('m90') || '' }}</td>
                    </tr>
                    <tr style="font-weight: bold; background-color: #f1f5f9;">
                      <td style="border: 1px solid #000; padding: 2px 3px; text-align: left;">ความผิดตามประมวลกฎหมายอื่น</td>
                      <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', 63, 1) || '' }}</td>
                      <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', 63, 2) || '' }}</td>
                      <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', 63, 3) || '' }}</td>
                      <td style="border: 1px solid #000; padding: 2px 3px; font-weight: bold; background-color: #cbd5e1;">{{ getRowTotal('m90', 63) || '' }}</td>
                    </tr>
                    <tr style="font-weight: bold; background-color: #f1f5f9;">
                      <td style="border: 1px solid #000; padding: 2px 3px; text-align: left;">ข้อหาอื่นนอกเหนือจากบัญชี</td>
                      <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', 120, 1) || '' }}</td>
                      <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', 120, 2) || '' }}</td>
                      <td style="border: 1px solid #000; padding: 2px 3px;">{{ getCategorySum('m90', 120, 3) || '' }}</td>
                      <td style="border: 1px solid #000; padding: 2px 3px; font-weight: bold; background-color: #cbd5e1;">{{ getRowTotal('m90', 120) || '' }}</td>
                    </tr>
                    <tr style="font-weight: bold; background-color: #cbd5e1;">
                      <td style="border: 1px solid #000; padding: 2px 3px; text-align: left;">รวมทั้งสิ้น</td>
                      <td style="border: 1px solid #000; padding: 2px 3px;">{{ getTableGrandTotal('m90', 1) || '' }}</td>
                      <td style="border: 1px solid #000; padding: 2px 3px;">{{ getTableGrandTotal('m90', 2) || '' }}</td>
                      <td style="border: 1px solid #000; padding: 2px 3px;">{{ getTableGrandTotal('m90', 3) || '' }}</td>
                      <td style="border: 1px solid #000; padding: 2px 3px; font-weight: bold; background-color: #94a3b8;">{{ getTableGrandRowTotal('m90') || '' }}</td>
                    </tr>
                  </tbody>
                </table>

                <div style="font-weight: bold; font-size: 0.68rem; margin-bottom: 2px; color: #000; margin-top: 2px;">จำนวนคดีที่ไม่อาจใช้มาตรการพิเศษแทนการดำเนินคดีอาญา ตามมาตรา 90</div>
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 0.58rem; margin-bottom: 8px; text-align: center;">
                  <thead>
                    <tr style="background-color: #f1f5f9; border-bottom: 1px solid #000; font-weight: bold;">
                      <th style="border: 1px solid #000; padding: 2px 3px; text-align: left; width: 75%;">รายการ</th>
                      <th style="border: 1px solid #000; padding: 2px 3px; width: 25%;">จำนวนคดี</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style="border: 1px solid #000; padding: 2px 3px; text-align: left;">จำนวนคดีที่ผู้เสียหาย ไม่ยินยอม</td>
                      <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['sec2_m90_noconsent_sum'] || 0 }}</td>
                    </tr>
                    <tr>
                      <td style="border: 1px solid #000; padding: 2px 3px; text-align: left;">จำนวนคดีที่โจทก์คัดค้าน</td>
                      <td style="border: 1px solid #000; padding: 2px 3px;">{{ monthlyReport.data['sec4_m90_failed_sum'] || 0 }}</td>
                    </tr>
                    <tr style="font-weight: bold; background-color: #f8fafc;">
                      <td style="border: 1px solid #000; padding: 2px 3px; text-align: left;">รวม</td>
                      <td style="border: 1px solid #000; padding: 2px 3px;">{{ (Number(monthlyReport.data['sec2_m90_noconsent_sum'] || 0) + Number(monthlyReport.data['sec4_m90_failed_sum'] || 0)) }}</td>
                    </tr>
                  </tbody>
                </table>

                <!-- ลายเซ็นตัวพิมพ์ปกติ ไม่หนา -->
                <div style="display: flex; justify-content: center; gap: 60px; margin-top: 5px; page-break-inside: avoid; width: 100%;">
                  <!-- Box 1: ลงนามผู้จัดทำ -->
                  <div style="width: 320px; border: 1px solid #000; background: #fff; display: flex; flex-direction: column;">
                    <div style="border-bottom: 1px solid #000; text-align: center; padding: 3px; font-size: 0.75rem; background-color: #f1f5f9; color: #000; font-weight: normal;">
                      ลงนามผู้จัดทำ
                    </div>
                    <div style="border-bottom: 1px solid #000; height: 45px; display: flex; align-items: center; justify-content: center; padding: 0 10px;">
                      <span style="color: #000; letter-spacing: 1px;">............................................................</span>
                    </div>
                    <div style="text-align: center; padding: 4px 5px; font-size: 0.75rem; color: #000; line-height: 1.25; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 45px; font-weight: normal;">
                      <div style="margin-bottom: 2px; font-weight: normal;">( {{ session.fullName }} )</div>
                      <div style="font-weight: normal;">{{ session.position || 'เจ้าหน้าที่ศูนย์ให้คำปรึกษา' }}</div>
                    </div>
                  </div>

                  <!-- Box 2: ลงนามผู้อำนวยการ -->
                  <div style="width: 320px; border: 1px solid #000; background: #fff; display: flex; flex-direction: column;">
                    <div style="border-bottom: 1px solid #000; text-align: center; padding: 3px; font-size: 0.75rem; background-color: #f1f5f9; color: #000; font-weight: normal;">
                      ลงนามผู้อำนวยการ
                    </div>
                    <div style="border-bottom: 1px solid #000; height: 45px; display: flex; align-items: center; justify-content: center; padding: 0 10px;">
                      <span style="color: #000; letter-spacing: 1px;">............................................................</span>
                    </div>
                    <div style="text-align: center; padding: 4px 5px; font-size: 0.75rem; color: #000; line-height: 1.25; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 45px; font-weight: normal;">
                      <div v-if="selectedDirectorObj" style="margin-bottom: 2px; font-weight: normal;">
                        ( {{ selectedDirectorObj.counselorName }} )
                      </div>
                      <div v-else style="margin-bottom: 2px; font-weight: normal;">
                        ( ........................................................ )
                      </div>
                      
                      <template v-if="selectedDirectorObj">
                        <template v-if="selectedDirectorObj.counselorPositionSecond">
                          <div style="font-weight: normal;">{{ selectedDirectorObj.counselorPosition }}</div>
                          <div style="font-size: 0.7rem; margin: 1px 0; font-weight: normal;">รักษาราชการแทน</div>
                          <div style="font-weight: normal;">{{ selectedDirectorObj.counselorPositionSecond }}</div>
                        </template>
                        <template v-else>
                          <div style="font-weight: normal;">{{ selectedDirectorObj.counselorPosition || 'ผู้อำนวยการสำนักงานประจำศาลฯ' }}</div>
                        </template>
                      </template>
                      <template v-else>
                        <div style="font-weight: normal;">ผู้อำนวยการสำนักงานประจำศาลฯ</div>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </div>`;

// Replace the substring in Index.html
const updatedIndexContent = indexContent.substring(0, m90StartIndex) + newM90Block + indexContent.substring(nextBlockIndex);
fs.writeFileSync(indexFile, updatedIndexContent, 'utf8');
console.log("Successfully updated Index.html M90 layout!");

// 2. Read Styles.html
let stylesContent = fs.readFileSync(stylesFile, 'utf8');

// Add styling rules for .m90-sheet class
const customM90Rules = `
    /* Custom tighter layout rules for ม.90 reports to fit on A4 portrait */
    .print-modal-overlay .a4-sheet.m90-sheet,
    .a4-sheet.m90-sheet {
      padding: 8mm 12mm !important;
      font-size: 11px !important;
      line-height: 1.15 !important;
    }
    
    .print-modal-overlay .a4-sheet.m90-sheet table,
    .a4-sheet.m90-sheet table {
      font-size: 10px !important;
    }
    
    .print-modal-overlay .a4-sheet.m90-sheet td,
    .print-modal-overlay .a4-sheet.m90-sheet th,
    .a4-sheet.m90-sheet td,
    .a4-sheet.m90-sheet th {
      padding: 2px 3px !important;
    }
`;

// Insert the custom rules just before the closing style tag </style>
const styleClosingTag = "</style>";
const styleClosingIndex = stylesContent.lastIndexOf(styleClosingTag);
if (styleClosingIndex !== -1) {
  const updatedStylesContent = stylesContent.substring(0, styleClosingIndex) + customM90Rules + stylesContent.substring(styleClosingIndex);
  fs.writeFileSync(stylesFile, updatedStylesContent, 'utf8');
  console.log("Successfully updated Styles.html with custom m90-sheet CSS rules!");
} else {
  console.error("Could not find </style> tag in Styles.html!");
}
