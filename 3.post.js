const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const axios = require("axios");
require('dotenv').config();

// 모듈 임포트
const { uploadImage } = require('./lib/image-module');
const { uploadVideo } = require('./lib/video-module');
const { changeTextFormat } = require('./lib/text-format-module');
const { changeAlignment } = require('./lib/align-module');
const { changeFontSize } = require('./lib/font-size-module');
const { createSlideshow } = require('./lib/slideshow-module');
const { addOgLink } = require('./lib/oglink-module');
const { addQuotation } = require('./lib/quotation-module');
const { login, loadLoginData, getCookieFilePath } = require('./lib/login-module');


const user = process.argv[3];
const cookie = process.argv[4];

console.log('process.argv ---- > ', process.argv);
const userJSON = JSON.parse(user);
const cookieJSON = JSON.parse(cookie);

console.log('받은 userJSON:', userJSON);
console.log('받은 cookieJSON:', cookieJSON);

// KST 시간 관련 헬퍼 함수들
function getKSTTime(date = null) {
    const now = date || new Date();
    const kstOffset = 9 * 60; // 한국시간은 UTC+9
    return new Date(now.getTime() + (now.getTimezoneOffset() + kstOffset) * 60000);
}

function createKSTDate(year, month, day, hour = 0, minute = 0, second = 0) {
    // 한국시간 기준으로 Date 객체 생성
    const kstTime = getKSTTime();
    kstTime.setFullYear(year);
    kstTime.setMonth(month - 1); // month는 0부터 시작
    kstTime.setDate(day);
    kstTime.setHours(hour, minute, second, 0);
    return kstTime;
}

// 네이버 계정 정보를 .env에서 가져오기
const POST_ID = userJSON.id;
const POST_PASSWORD = userJSON.password;
let BLOG_ID = userJSON.blogId; // cookies JSON에서 가져올 예정

// 타이핑 속도 설정 (1: 랜덤 속도, 0: 매우 빠른 속도)
const RANDOM_TYPING = 0;

// 동영상 생성 여부 (1: 동영상 생성 및 업로드, 0: 동영상 사용 안함)
const USE_VIDEO = 0;

// 발행 간격 설정 (시간 단위, 예: 3.5 = 3시간 30분)
const RANDOM_DELAY_MIN = 3.5;  // 최소 3시간 30분
const RANDOM_DELAY_MAX = 5;    // 최대 5시간

// 발행 기록 파일 관리 함수들
function getPostedFileName(userId) {
    const kstDate = getKSTTime();

    const year = kstDate.getFullYear();
    const month = String(kstDate.getMonth() + 1).padStart(2, '0');
    const day = String(kstDate.getDate()).padStart(2, '0');

    return `${userId}_posted_${year}${month}${day}.txt`;
}

// 오래된 발행 기록 파일 삭제 함수
function cleanupOldPostedFiles(userId) {
    const todayFileName = getPostedFileName(userId);
    const files = fs.readdirSync(__dirname);

    // userId_posted_*.txt 패턴의 파일들 찾기
    const postedFiles = files.filter(file => {
        return file.startsWith(`${userId}_posted_`) && file.endsWith('.txt');
    });

    let deletedCount = 0;
    const currentDate = new Date();
    
    postedFiles.forEach(file => {
        if (file !== todayFileName) {
            // 파일명에서 날짜 추출 (userId_posted_YYYYMMDD.txt)
            const dateMatch = file.match(/_posted_(\d{8})\.txt$/);
            if (dateMatch) {
                const fileDate = dateMatch[1]; // YYYYMMDD
                const year = parseInt(fileDate.substring(0, 4));
                const month = parseInt(fileDate.substring(4, 6));
                const day = parseInt(fileDate.substring(6, 8));
                
                const fileDateObj = new Date(year, month - 1, day); // month는 0부터 시작
                const daysDiff = Math.floor((currentDate - fileDateObj) / (1000 * 60 * 60 * 24));
                
                // 3일 이상 된 파일만 삭제
                if (daysDiff >= 3) {
                    try {
                        fs.unlinkSync(path.join(__dirname, file));
                        console.log(`오래된 발행 기록 파일 삭제: ${file} (${daysDiff}일 전)`);
                        deletedCount++;
                    } catch (err) {
                        console.error(`${file} 삭제 실패:`, err.message);
                    }
                } else {
                    console.log(`발행 기록 파일 유지: ${file} (${daysDiff}일 전, 3일 미만)`);
                }
            }
        }
    });

    if (deletedCount > 0) {
        console.log(`총 ${deletedCount}개의 오래된 발행 기록 파일이 삭제되었습니다.`);
    }
}

function loadPostedRecords(userId) {
    const fileName = getPostedFileName(userId);
    const filePath = path.join(__dirname, fileName);

    if (!fs.existsSync(filePath)) {
        return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    const records = lines.map(line => {
        // 새 형식: 1회:2025-08-31:13:30분
        const newMatch = line.match(/(\d+)회:(\d{4}-\d{2}-\d{2}):(\d{2}):(\d{2})분/);
        if (newMatch) {
            return {
                count: parseInt(newMatch[1]),
                date: newMatch[2],
                hour: parseInt(newMatch[3]),
                minute: parseInt(newMatch[4])
            };
        }
        
        // 기존 형식: 1회:13:30분 (호환성 유지)
        const oldMatch = line.match(/(\d+)회:(\d{2}):(\d{2})분/);
        if (oldMatch) {
            // 기존 형식은 현재 KST 날짜로 가정
            const kstDate = getKSTTime();
            const year = kstDate.getFullYear();
            const month = String(kstDate.getMonth() + 1).padStart(2, '0');
            const day = String(kstDate.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            return {
                count: parseInt(oldMatch[1]),
                date: dateStr,
                hour: parseInt(oldMatch[2]),
                minute: parseInt(oldMatch[3])
            };
        }
        return null;
    }).filter(Boolean);

    // 시간순으로 정렬 (최신순), 시간이 같으면 회차 번호로 정렬
    records.sort((a, b) => {
        const timeA = new Date(`${a.date}T${String(a.hour).padStart(2, '0')}:${String(a.minute).padStart(2, '0')}:00+09:00`);
        const timeB = new Date(`${b.date}T${String(b.hour).padStart(2, '0')}:${String(b.minute).padStart(2, '0')}:00+09:00`);
        
        // 시간이 다르면 시간 기준으로 정렬
        if (timeB.getTime() !== timeA.getTime()) {
            return timeB - timeA; // 내림차순 정렬 (최신이 먼저)
        }
        
        // 시간이 같으면 회차 번호로 정렬 (높은 회차가 최신)
        return b.count - a.count;
    });

    return records;
}

function savePostedRecord(userId, hour, minute, scheduledDate = null) {
    const fileName = getPostedFileName(userId);
    const filePath = path.join(__dirname, fileName);

    const records = loadPostedRecords(userId);
    
    // 예약 날짜가 제공되면 사용, 아니면 현재 KST 날짜 사용
    let dateStr;
    if (scheduledDate) {
        dateStr = scheduledDate;
    } else {
        const kstDate = getKSTTime();
        const year = kstDate.getFullYear();
        const month = String(kstDate.getMonth() + 1).padStart(2, '0');
        const day = String(kstDate.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
    }

    // 중복 저장 방지: 같은 날짜와 시간이 이미 존재하는지 확인
    const isDuplicate = records.some(record => 
        record.date === dateStr && 
        record.hour === hour && 
        record.minute === minute
    );
    
    if (isDuplicate) {
        console.log(`⚠️ 중복된 발행 기록이 이미 존재합니다: ${dateStr} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
        return { count: records.length, date: dateStr, hour, minute };
    }

    const count = records.length + 1;
    const newRecord = `${count}회:${dateStr}:${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}분\n`;

    fs.appendFileSync(filePath, newRecord, 'utf-8');
    console.log(`발행 기록 저장: ${newRecord.trim()}`);

    return { count, date: dateStr, hour, minute };
}

function calculateNextPostTime(records) {
    if (records.length === 0) {
        // 첫 발행이면 네이버 기본 시간을 사용하므로 null 반환
        return null;
    }

    // 마지막 발행 시간 가져오기 (시간순 정렬된 첫 번째가 최신)
    const lastRecord = records[0];

    // 마지막 발행 시간을 KST 기준으로 생성
    const lastTime = createKSTDate(
        parseInt(lastRecord.date.split('-')[0]), // year
        parseInt(lastRecord.date.split('-')[1]), // month
        parseInt(lastRecord.date.split('-')[2]), // day
        lastRecord.hour,
        lastRecord.minute
    );

    // 상수로 설정된 시간 범위를 분 단위로 변환
    const minMinutes = Math.floor(RANDOM_DELAY_MIN * 60); // 시간을 분으로 변환
    const maxMinutes = Math.floor(RANDOM_DELAY_MAX * 60); // 시간을 분으로 변환
    const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;

    console.log(`다음 발행까지 ${Math.floor(randomMinutes / 60)}시간 ${randomMinutes % 60}분 후로 설정`);

    // 다음 발행 시간 계산 (KST 기준, 날짜 자동 변경 포함)
    const nextTime = new Date(lastTime.getTime() + randomMinutes * 60000);

    console.log(`🔍 calculateNextPostTime 디버깅:`);
    console.log(`   📅 마지막 발행: ${lastTime.getFullYear()}-${String(lastTime.getMonth()+1).padStart(2,'0')}-${String(lastTime.getDate()).padStart(2,'0')} ${String(lastTime.getHours()).padStart(2,'0')}:${String(lastTime.getMinutes()).padStart(2,'0')}`);
    console.log(`   ⏰ 추가 시간: ${randomMinutes}분 (${Math.floor(randomMinutes/60)}시간 ${randomMinutes%60}분)`);
    console.log(`   🎯 계산 결과: ${nextTime.getFullYear()}-${String(nextTime.getMonth()+1).padStart(2,'0')}-${String(nextTime.getDate()).padStart(2,'0')} ${String(nextTime.getHours()).padStart(2,'0')}:${String(nextTime.getMinutes()).padStart(2,'0')}`);

    return {
        hour: nextTime.getHours(),
        minute: Math.floor(nextTime.getMinutes() / 10) * 10, // 10분 단위로 반올림
        scheduledTime: nextTime // 완전한 날짜 시간 객체도 반환
    };
}



// 파일 전송 오류 팝업 처리 함수
async function handleFileTransferError(page, frame) {
    try {
        console.log('파일 전송 오류 팝업 확인 중...');
        
        let errorFound = false;
        let popupHandled = false;
        
        // 1. iframe 내부에서 팝업 확인
        try {
            const framePopupExists = await frame.$('.se-popup-container.__se-pop-layer');
            if (framePopupExists) {
                const titleElement = await frame.$('.se-popup-title');
                if (titleElement) {
                    const titleText = await frame.evaluate(el => el.textContent, titleElement);
                    if (titleText && titleText.includes('파일 전송 오류')) {
                        console.log('iframe 내부에서 파일 전송 오류 팝업 발견!');
                        errorFound = true;
                        
                        // 확인 버튼 클릭
                        const confirmBtn = await frame.$('.se-popup-button-confirm');
                        if (confirmBtn) {
                            await confirmBtn.click();
                            console.log('✅ iframe 내부에서 확인 버튼 클릭 완료');
                            popupHandled = true;
                            await new Promise((resolve) => setTimeout(resolve, 1000));
                        }
                    }
                }
            }
        } catch (frameError) {
            // iframe 내부 확인 실패는 무시하고 메인 페이지 확인
        }
        
        // 2. 메인 페이지에서 팝업 확인 (iframe에서 찾지 못한 경우)
        if (!errorFound) {
            try {
                const pagePopupExists = await page.$('.se-popup-container.__se-pop-layer');
                if (pagePopupExists) {
                    const titleElement = await page.$('.se-popup-title');
                    if (titleElement) {
                        const titleText = await page.evaluate(el => el.textContent, titleElement);
                        if (titleText && titleText.includes('파일 전송 오류')) {
                            console.log('메인 페이지에서 파일 전송 오류 팝업 발견!');
                            errorFound = true;
                            
                            // 확인 버튼 클릭
                            const confirmBtn = await page.$('.se-popup-button-confirm');
                            if (confirmBtn) {
                                await confirmBtn.click();
                                console.log('✅ 메인 페이지에서 확인 버튼 클릭 완료');
                                popupHandled = true;
                                await new Promise((resolve) => setTimeout(resolve, 1000));
                            }
                        }
                    }
                }
            } catch (pageError) {
                // 메인 페이지 확인 실패
            }
        }
        
        // 3. 일반적인 팝업 텍스트로도 확인
        if (!errorFound) {
            try {
                // iframe 내부에서 텍스트로 확인
                const frameTextExists = await frame.evaluate(() => {
                    const alertText = document.querySelector('.se-popup-alert-text');
                    return alertText && alertText.textContent.includes('일시적으로 파일전송을 사용할 수 없습니다');
                });
                
                if (frameTextExists) {
                    console.log('iframe 내부에서 파일전송 오류 텍스트 발견!');
                    errorFound = true;
                    const confirmBtn = await frame.$('.se-popup-button-confirm');
                    if (confirmBtn) {
                        await confirmBtn.click();
                        console.log('✅ iframe 내부에서 텍스트 기반 확인 버튼 클릭 완료');
                        popupHandled = true;
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                    }
                }
                
                // 메인 페이지에서 텍스트로 확인
                if (!errorFound) {
                    const pageTextExists = await page.evaluate(() => {
                        const alertText = document.querySelector('.se-popup-alert-text');
                        return alertText && alertText.textContent.includes('일시적으로 파일전송을 사용할 수 없습니다');
                    });
                    
                    if (pageTextExists) {
                        console.log('메인 페이지에서 파일전송 오류 텍스트 발견!');
                        errorFound = true;
                        const confirmBtn = await page.$('.se-popup-button-confirm');
                        if (confirmBtn) {
                            await confirmBtn.click();
                            console.log('✅ 메인 페이지에서 텍스트 기반 확인 버튼 클릭 완료');
                            popupHandled = true;
                            await new Promise((resolve) => setTimeout(resolve, 1000));
                        }
                    }
                }
            } catch (textError) {
                // 텍스트 기반 확인 실패
            }
        }
        
        if (errorFound && !popupHandled) {
            // 오류는 발견했지만 처리하지 못한 경우, ESC 키로 시도
            console.log('확인 버튼을 찾을 수 없어 ESC 키로 팝업 닫기 시도...');
            await page.keyboard.press('Escape');
            await new Promise((resolve) => setTimeout(resolve, 500));
            popupHandled = true;
        }
        
        return errorFound; // 오류가 발견되었으면 true, 아니면 false 반환
        
    } catch (error) {
        console.log('파일 전송 오류 팝업 확인 중 오류:', error.message);
        return false;
    }
}

// Chrome 실행 파일 경로 찾기 함수
function findChromePath() {
    const platform = os.platform();
    let chromePaths = [];

    if (platform === 'win32') {
        // Windows Chrome 경로들
        chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
            'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
        ];
    } else if (platform === 'darwin') {
        // macOS Chrome 경로들
        chromePaths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            path.join(os.homedir(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
        ];
    } else {
        // Linux Chrome 경로들
        chromePaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium'
        ];
    }

    // 존재하는 첫 번째 경로 반환
    for (const chromePath of chromePaths) {
        if (fs.existsSync(chromePath)) {
            console.log(`Chrome 경로를 찾았습니다: ${chromePath}`);
            return chromePath;
        }
    }

    console.log('Chrome을 찾을 수 없습니다. 기본 설정을 사용합니다.');
    return null;
}

// 빠른 타이핑을 위한 함수
async function typeWithRandomDelay(page, text, frame = null) {
    // 여러 형태의 백슬래시와 줄바꿈 텍스트를 실제 줄바꿈으로 처리
    text = text.replace(/\\backslash\s+n/g, '\n')  // \backslash n 패턴
        .replace(/\(backslash n\)/g, '\n')      // (backslash n) 텍스트
        .replace(/\\+n/g, '\n')                 // \n, \\n, \\\n 등 모든 백슬래시+n
        .replace(/\\\s+/g, '\n')                // 백슬래시+공백들
        .replace(/\n\s+/g, '\n')                // 줄바꿈 후 공백 제거
        .trim();                                // 앞뒤 공백 제거

    // \n을 엔터로 처리하기 위해 줄 단위로 분리
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (RANDOM_TYPING === 1) {
            // 랜덤 속도로 타이핑
            for (const char of line) {
                await page.keyboard.type(char, { delay: 30 + Math.random() * 40 }); // 30-70ms 랜덤
            }
        } else {
            // 매우 빠른 속도로 타이핑 - 복사-붙여넣기 방식
            if (frame) {
                // iframe 내부에서 실행
                await frame.evaluate((text) => {
                    const activeElement = document.activeElement;
                    if (activeElement) {
                        // 직접 텍스트 입력
                        const event = new InputEvent('input', { bubbles: true });
                        activeElement.textContent += text;
                        activeElement.dispatchEvent(event);
                    }
                }, line);
            } else {
                // 일반 페이지에서는 기존 방식
                await page.keyboard.type(line, { delay: 0 }); // 딜레이 0으로 최대한 빠르게
            }
        }

        // 마지막 줄이 아니면 엔터 키 입력
        if (i < lines.length - 1) {
            await page.keyboard.press('Enter');
            await new Promise((resolve) => setTimeout(resolve, 20)); // 엔터 후 매우 짧은 대기
        }
    }
}

async function doubleCheckPopup(page, frame){
        console.log("doubleCheckPopup --- 도움말 팝업 확인을 시작합니다...");
          // 2. 작성 중인 글 팝업 처리 완료 후 도움말 팝업 처리
        try {
            console.log("도움말 팝업 확인을 시작합니다...");
            await new Promise((resolve) => setTimeout(resolve, 1000));
            let popupClosed = false;

            // 2-1. iframe 내부에서 도움말 팝업 확인 및 닫기 시도
            console.log("iframe 내부에서 도움말 팝업 확인 중...");
            const helpTitleInFrame = await frame.$('h1.se-help-title');
            if (helpTitleInFrame) {
                console.log("iframe 내부에서 도움말 팝업 발견!");

                const selectors = [
                    'button.se-help-panel-close-button',
                    '.se-help-panel-close-button',
                    'button[type="button"].se-help-panel-close-button',
                    '.se-help-header button[type="button"]',
                    '.se-help-header button',
                    'button:has(.se-blind:contains("닫기"))'
                ];

                for (const selector of selectors) {
                    try {
                        const btn = await frame.$(selector);
                        if (btn) {
                            await btn.click();
                            console.log(`✅ iframe 내부에서 닫기 성공! (선택자: ${selector})`);
                            popupClosed = true;
                            break;
                        }
                    } catch (e) {
                        console.log(`iframe 내부 ${selector} 시도 실패`);
                    }
                }

                // JavaScript로 직접 클릭 시도
                if (!popupClosed) {
                    try {
                        await frame.evaluate(() => {
                            const closeBtn = document.querySelector('button.se-help-panel-close-button');
                            if (closeBtn) {
                                closeBtn.click();
                                return true;
                            }
                            return false;
                        });
                        console.log("✅ iframe 내부에서 JavaScript로 닫기 성공!");
                        popupClosed = true;
                    } catch (e) {
                        console.log("iframe 내부 JavaScript 클릭 실패");
                    }
                }
            }

            // 2-2. iframe 밖(메인 페이지)에서 도움말 팝업 확인 및 닫기 시도
            if (!popupClosed) {
                console.log("메인 페이지에서 도움말 팝업 확인 중...");
                const helpTitleInPage = await page.$('h1.se-help-title');
                if (helpTitleInPage) {
                    console.log("메인 페이지에서 도움말 팝업 발견!");

                    const selectors = [
                        'button.se-help-panel-close-button',
                        '.se-help-panel-close-button',
                        'button[type="button"].se-help-panel-close-button',
                        '.se-help-header button[type="button"]',
                        '.se-help-header button',
                        'button:has(.se-blind)'
                    ];

                    for (const selector of selectors) {
                        try {
                            const btn = await page.$(selector);
                            if (btn) {
                                await btn.click();
                                console.log(`✅ 메인 페이지에서 닫기 성공! (선택자: ${selector})`);
                                popupClosed = true;
                                break;
                            }
                        } catch (e) {
                            console.log(`메인 페이지 ${selector} 시도 실패`);
                        }
                    }

                    // JavaScript로 직접 클릭 시도
                    if (!popupClosed) {
                        try {
                            const result = await page.evaluate(() => {
                                const closeBtn = document.querySelector('button.se-help-panel-close-button');
                                if (closeBtn) {
                                    closeBtn.click();
                                    return true;
                                }
                                // 모든 버튼을 찾아서 닫기 텍스트가 있는 버튼 클릭
                                const allButtons = document.querySelectorAll('button');
                                for (const btn of allButtons) {
                                    if (btn.innerText === '닫기' || btn.innerHTML.includes('닫기')) {
                                        btn.click();
                                        return true;
                                    }
                                }
                                return false;
                            });
                            if (result) {
                                console.log("✅ 메인 페이지에서 JavaScript로 닫기 성공!");
                                popupClosed = true;
                            }
                        } catch (e) {
                            console.log("메인 페이지 JavaScript 클릭 실패");
                        }
                    }
                }
            }

            // 2-3. ESC 키로 닫기 시도
            if (!popupClosed) {
                console.log("ESC 키로 닫기 시도...");
                await page.keyboard.press('Escape');
                await new Promise((resolve) => setTimeout(resolve, 500));

                // 팝업이 닫혔는지 확인
                const stillExists = await frame.$('h1.se-help-title') || await page.$('h1.se-help-title');
                if (!stillExists) {
                    console.log("✅ ESC 키로 닫기 성공!");
                    popupClosed = true;
                }
            }

            if (popupClosed) {
                console.log("도움말 팝업을 성공적으로 닫았습니다!");
                await new Promise((resolve) => setTimeout(resolve, 500));
            } else {
                console.log("도움말 팝업을 닫을 수 없었지만 계속 진행합니다.");
            }

        } catch (helpError) {
            console.log("도움말 팝업 처리 중 오류:", helpError.message);
            // 오류가 있어도 계속 진행
        }

        // 3. 링크 도움말 팝업 처리 (메인 도움말 닫은 후 나타날 수 있음)
        try {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            console.log("링크 도움말 팝업 확인을 시작합니다...");

            let linkHelpClosed = false;

            // 3-1. iframe 내부에서 링크 도움말 확인
            const linkHelpTitleInFrame = await frame.$('h1.se-help-layer-title');
            if (linkHelpTitleInFrame) {
                const titleText = await frame.evaluate(el => el.textContent, linkHelpTitleInFrame);
                if (titleText && titleText.includes('링크')) {
                    console.log("iframe 내부에서 링크 도움말 팝업 발견!");

                    const closeSelectors = [
                        'button.se-help-layer-button-close',
                        '.se-help-layer-button-close',
                        '.se-help-layer-header button[type="button"]:last-child',
                        'button:has(.se-blind:contains("닫기"))'
                    ];

                    for (const selector of closeSelectors) {
                        try {
                            const closeBtn = await frame.$(selector);
                            if (closeBtn) {
                                await closeBtn.click();
                                console.log(`✅ 링크 도움말 팝업 닫기 성공! (iframe, 선택자: ${selector})`);
                                linkHelpClosed = true;
                                break;
                            }
                        } catch (e) {
                            // 다음 선택자 시도
                        }
                    }
                }
            }

            // 3-2. 메인 페이지에서 링크 도움말 확인
            if (!linkHelpClosed) {
                const linkHelpTitleInPage = await page.$('h1.se-help-layer-title');
                if (linkHelpTitleInPage) {
                    const titleText = await page.evaluate(el => el.textContent, linkHelpTitleInPage);
                    if (titleText && titleText.includes('링크')) {
                        console.log("메인 페이지에서 링크 도움말 팝업 발견!");

                        const closeSelectors = [
                            'button.se-help-layer-button-close',
                            '.se-help-layer-button-close',
                            '.se-help-layer-header button[type="button"]:last-child',
                            'button:has(.se-blind:contains("닫기"))'
                        ];

                        for (const selector of closeSelectors) {
                            try {
                                const closeBtn = await page.$(selector);
                                if (closeBtn) {
                                    await closeBtn.click();
                                    console.log(`✅ 링크 도움말 팝업 닫기 성공! (page, 선택자: ${selector})`);
                                    linkHelpClosed = true;
                                    break;
                                }
                            } catch (e) {
                                // 다음 선택자 시도
                            }
                        }
                    }
                }
            }

            if (linkHelpClosed) {
                console.log("링크 도움말 팝업을 닫았습니다.");
                await new Promise((resolve) => setTimeout(resolve, 500));
            }

        } catch (linkHelpError) {
            console.log("링크 도움말 처리 중 오류:", linkHelpError.message);
            // 오류가 있어도 계속 진행
        }
}


// 블로그 글쓰기 함수
async function writePost(page, browser) {
    try {
        console.log("글쓰기 작업을 시작합니다...");

        // result.json 읽기
        const resultData = JSON.parse(fs.readFileSync('result.json', 'utf-8'));

        // gemini 데이터 확인
        if (!resultData.gemini || !resultData.gemini.h1 || !resultData.gemini.sections) {
            console.error('result.json에 gemini 데이터가 없습니다. 먼저 3.gemini_run.js를 실행하세요.');
            return;
        }

        // iframe이 로드될 때까지 대기
        await page.waitForSelector('#mainFrame', { timeout: 10000 });

        // iframe으로 전환
        const frameHandle = await page.$('#mainFrame');
        const frame = await frameHandle.contentFrame();

        if (!frame) {
            console.error("iframe을 찾을 수 없습니다.");
            return;
        }

        console.log("iframe에 접근했습니다.");

        // 1. 먼저 작성 중인 글 팝업 확인 및 처리
        try {
            console.log("작성 중인 글 팝업 확인 중...");
            await new Promise((resolve) => setTimeout(resolve, 5000));

            const popupExists = await frame.$('.se-popup-container.__se-pop-layer');
            if (popupExists) {
                console.log("작성 중인 글 팝업을 발견했습니다. 취소 버튼을 클릭합니다...");
                await frame.click('.se-popup-button-cancel');
                console.log("취소 버튼 클릭 완료. 팝업이 완전히 닫히기를 기다립니다...");
                await new Promise((resolve) => setTimeout(resolve, 3000)); // 팝업이 완전히 닫힐 때까지 충분히 대기
            } else {
                console.log("작성 중인 글 팝업이 없습니다.");
            }
        } catch (popupError) {
            console.log("작성 중인 글 팝업 처리 중 오류:", popupError.message);
        }

        // 2. 작성 중인 글 팝업 처리 완료 후 도움말 팝업 처리
        try {
            console.log("도움말 팝업 확인을 시작합니다...");
            await new Promise((resolve) => setTimeout(resolve, 5000));
            let popupClosed = false;

            // 2-1. iframe 내부에서 도움말 팝업 확인 및 닫기 시도
            console.log("iframe 내부에서 도움말 팝업 확인 중...");
            const helpTitleInFrame = await frame.$('h1.se-help-title');
            if (helpTitleInFrame) {
                console.log("iframe 내부에서 도움말 팝업 발견!");

                const selectors = [
                    'button.se-help-panel-close-button',
                    '.se-help-panel-close-button',
                    'button[type="button"].se-help-panel-close-button',
                    '.se-help-header button[type="button"]',
                    '.se-help-header button',
                    'button:has(.se-blind:contains("닫기"))'
                ];

                for (const selector of selectors) {
                    try {
                        const btn = await frame.$(selector);
                        if (btn) {
                            await btn.click();
                            console.log(`✅ iframe 내부에서 닫기 성공! (선택자: ${selector})`);
                            popupClosed = true;
                            break;
                        }
                    } catch (e) {
                        console.log(`iframe 내부 ${selector} 시도 실패`);
                    }
                }

                // JavaScript로 직접 클릭 시도
                if (!popupClosed) {
                    try {
                        await frame.evaluate(() => {
                            const closeBtn = document.querySelector('button.se-help-panel-close-button');
                            if (closeBtn) {
                                closeBtn.click();
                                return true;
                            }
                            return false;
                        });
                        console.log("✅ iframe 내부에서 JavaScript로 닫기 성공!");
                        popupClosed = true;
                    } catch (e) {
                        console.log("iframe 내부 JavaScript 클릭 실패");
                    }
                }
            }

            // 2-2. iframe 밖(메인 페이지)에서 도움말 팝업 확인 및 닫기 시도
            if (!popupClosed) {
                console.log("메인 페이지에서 도움말 팝업 확인 중...");
                const helpTitleInPage = await page.$('h1.se-help-title');
                if (helpTitleInPage) {
                    console.log("메인 페이지에서 도움말 팝업 발견!");

                    const selectors = [
                        'button.se-help-panel-close-button',
                        '.se-help-panel-close-button',
                        'button[type="button"].se-help-panel-close-button',
                        '.se-help-header button[type="button"]',
                        '.se-help-header button',
                        'button:has(.se-blind)'
                    ];

                    for (const selector of selectors) {
                        try {
                            const btn = await page.$(selector);
                            if (btn) {
                                await btn.click();
                                console.log(`✅ 메인 페이지에서 닫기 성공! (선택자: ${selector})`);
                                popupClosed = true;
                                break;
                            }
                        } catch (e) {
                            console.log(`메인 페이지 ${selector} 시도 실패`);
                        }
                    }

                    // JavaScript로 직접 클릭 시도
                    if (!popupClosed) {
                        try {
                            const result = await page.evaluate(() => {
                                const closeBtn = document.querySelector('button.se-help-panel-close-button');
                                if (closeBtn) {
                                    closeBtn.click();
                                    return true;
                                }
                                // 모든 버튼을 찾아서 닫기 텍스트가 있는 버튼 클릭
                                const allButtons = document.querySelectorAll('button');
                                for (const btn of allButtons) {
                                    if (btn.innerText === '닫기' || btn.innerHTML.includes('닫기')) {
                                        btn.click();
                                        return true;
                                    }
                                }
                                return false;
                            });
                            if (result) {
                                console.log("✅ 메인 페이지에서 JavaScript로 닫기 성공!");
                                popupClosed = true;
                            }
                        } catch (e) {
                            console.log("메인 페이지 JavaScript 클릭 실패");
                        }
                    }
                }
            }

            // 2-3. ESC 키로 닫기 시도
            if (!popupClosed) {
                console.log("ESC 키로 닫기 시도...");
                await page.keyboard.press('Escape');
                await new Promise((resolve) => setTimeout(resolve, 500));

                // 팝업이 닫혔는지 확인
                const stillExists = await frame.$('h1.se-help-title') || await page.$('h1.se-help-title');
                if (!stillExists) {
                    console.log("✅ ESC 키로 닫기 성공!");
                    popupClosed = true;
                }
            }

            if (popupClosed) {
                console.log("도움말 팝업을 성공적으로 닫았습니다!");
                await new Promise((resolve) => setTimeout(resolve, 500));
            } else {
                console.log("도움말 팝업을 닫을 수 없었지만 계속 진행합니다.");
            }

        } catch (helpError) {
            console.log("도움말 팝업 처리 중 오류:", helpError.message);
            // 오류가 있어도 계속 진행
        }

        // 3. 링크 도움말 팝업 처리 (메인 도움말 닫은 후 나타날 수 있음)
        try {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            console.log("링크 도움말 팝업 확인을 시작합니다...");

            let linkHelpClosed = false;

            // 3-1. iframe 내부에서 링크 도움말 확인
            const linkHelpTitleInFrame = await frame.$('h1.se-help-layer-title');
            if (linkHelpTitleInFrame) {
                const titleText = await frame.evaluate(el => el.textContent, linkHelpTitleInFrame);
                if (titleText && titleText.includes('링크')) {
                    console.log("iframe 내부에서 링크 도움말 팝업 발견!");

                    const closeSelectors = [
                        'button.se-help-layer-button-close',
                        '.se-help-layer-button-close',
                        '.se-help-layer-header button[type="button"]:last-child',
                        'button:has(.se-blind:contains("닫기"))'
                    ];

                    for (const selector of closeSelectors) {
                        try {
                            const closeBtn = await frame.$(selector);
                            if (closeBtn) {
                                await closeBtn.click();
                                console.log(`✅ 링크 도움말 팝업 닫기 성공! (iframe, 선택자: ${selector})`);
                                linkHelpClosed = true;
                                break;
                            }
                        } catch (e) {
                            // 다음 선택자 시도
                        }
                    }
                }
            }

            // 3-2. 메인 페이지에서 링크 도움말 확인
            if (!linkHelpClosed) {
                const linkHelpTitleInPage = await page.$('h1.se-help-layer-title');
                if (linkHelpTitleInPage) {
                    const titleText = await page.evaluate(el => el.textContent, linkHelpTitleInPage);
                    if (titleText && titleText.includes('링크')) {
                        console.log("메인 페이지에서 링크 도움말 팝업 발견!");

                        const closeSelectors = [
                            'button.se-help-layer-button-close',
                            '.se-help-layer-button-close',
                            '.se-help-layer-header button[type="button"]:last-child',
                            'button:has(.se-blind:contains("닫기"))'
                        ];

                        for (const selector of closeSelectors) {
                            try {
                                const closeBtn = await page.$(selector);
                                if (closeBtn) {
                                    await closeBtn.click();
                                    console.log(`✅ 링크 도움말 팝업 닫기 성공! (page, 선택자: ${selector})`);
                                    linkHelpClosed = true;
                                    break;
                                }
                            } catch (e) {
                                // 다음 선택자 시도
                            }
                        }
                    }
                }
            }

            if (linkHelpClosed) {
                console.log("링크 도움말 팝업을 닫았습니다.");
                await new Promise((resolve) => setTimeout(resolve, 500));
            }

        } catch (linkHelpError) {
            console.log("링크 도움말 처리 중 오류:", linkHelpError.message);
            // 오류가 있어도 계속 진행
        }

        // 이미 위에서 작성 중인 글 팝업과 도움말 팝업을 순차적으로 처리했으므로 여기서는 제거

        // 제목 입력 (h1)
        console.log(`제목 입력: ${resultData.gemini.h1}`);
        await frame.waitForSelector('.se-title-text', { timeout: 10000 });
        await frame.click('.se-title-text');
        await new Promise((resolve) => setTimeout(resolve, 100));
        await typeWithRandomDelay(page, resultData.gemini.h1);

        // 본문으로 이동
        console.log("본문 작성을 시작합니다...");
        await new Promise((resolve) => setTimeout(resolve, 200));

        // 본문 클릭
        await frame.waitForSelector('.se-section-text', { timeout: 10000 });
        await frame.click('.se-section-text');
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 네이버 파트너스 문구 추가 (인용구 없이)
        console.log("네이버 파트너스 안내 문구를 추가합니다...");

        const selectedProduct = resultData.상품목록.find(p => p.상품ID === resultData.선택된상품ID);
        const discountRate = selectedProduct?.할인율;

        let partnerDisclaimer = "네이버 파트너스 일환으로 소정의 수수료를 받습니다.\n";

        if (discountRate && discountRate !== null && discountRate !== undefined && discountRate !== '') {
            partnerDisclaimer += `구매가격에는 변화없으니 안심하고 확인하세요! 맨 아래에는 ${discountRate} 할인 링크가있으니 꼭 확인하세요!`;
        } else {
            partnerDisclaimer += "구매가격에는 변화없으니 안심하고 확인하세요! 맨 아래에는 할인 링크가있으니 꼭 확인하세요!";
        }

        await typeWithRandomDelay(page, partnerDisclaimer);

        // 엔터 두 번
        await new Promise((resolve) => setTimeout(resolve, 500));
        await page.keyboard.press('Enter');
        await new Promise((resolve) => setTimeout(resolve, 100));
        await page.keyboard.press('Enter');
        await new Promise((resolve) => setTimeout(resolve, 500));

        // h3 인사말 입력 (gemini에 h3가 있는 경우)
        if (resultData.gemini.h3) {
            console.log(`인사말 입력: ${resultData.gemini.h3}`);
            await typeWithRandomDelay(page, resultData.gemini.h3);

            // 엔터 두 번으로 단락 구분
            await new Promise((resolve) => setTimeout(resolve, 100));
            await page.keyboard.press('Enter');
            await new Promise((resolve) => setTimeout(resolve, 50));
            await page.keyboard.press('Enter');
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // 각 섹션 처리
        for (let i = 0; i < resultData.gemini.sections.length; i++) {
            const section = resultData.gemini.sections[i];
            // 상품 이미지 처리
            const selectedProduct = resultData.상품목록.find(p => p.상품ID === resultData.선택된상품ID);
            const images = selectedProduct ? [
                selectedProduct.대표이미지URL,
                ...(selectedProduct.기타이미지URL || [])
            ] : [];
            const imageIndex = i % images.length; // 이미지 순환

            console.log(`\n섹션 ${i + 1} 처리 중...`);

            // 인용구 5 (box) 사용
            await addQuotation(page, frame, 'd');
            await new Promise((resolve) => setTimeout(resolve, 100));

            // h2 텍스트 입력 (인용구 안에)
            console.log(`인용구 5에 입력: ${section.h2}`);
            await typeWithRandomDelay(page, section.h2);

            // 인용구 밖으로 나가기 - 아래 화살표 두 번
            await new Promise((resolve) => setTimeout(resolve, 500));
            await page.keyboard.press('ArrowDown');
            await new Promise((resolve) => setTimeout(resolve, 200));
            await page.keyboard.press('ArrowDown');
            await new Promise((resolve) => setTimeout(resolve, 500));

            // 엔터 키 누르기
            await page.keyboard.press('Enter');
            await new Promise((resolve) => setTimeout(resolve, 500));

            // 이미지 추가 (p 태그 바로 위에)
            const imgsDir = path.join(__dirname, 'imgs');
            if (fs.existsSync(imgsDir)) {
                const imageFiles = fs.readdirSync(imgsDir)
                    .filter(file => file.startsWith('product_') && (file.endsWith('.jpg') || file.endsWith('.png')))
                    .sort((a, b) => {
                        const numA = parseInt(a.match(/product_(\d+)/)?.[1] || 0);
                        const numB = parseInt(b.match(/product_(\d+)/)?.[1] || 0);
                        return numA - numB;
                    });

                // 이미지가 있고, 현재 섹션 인덱스가 이미지 수보다 작을 때만 이미지 추가
                if (imageFiles.length > 0 && i < imageFiles.length) {
                    const imagePath = path.join(imgsDir, imageFiles[i]); // 순환 대신 직접 인덱스 사용
                    console.log(`이미지 추가: ${imagePath}`);
                    
                    // 이미지 업로드 시도
                    let uploadSuccess = false;
                    let retryCount = 0;
                    const maxRetries = 3;
                    
                    while (!uploadSuccess && retryCount < maxRetries) {
                        try {
                            await uploadImage(page, frame, imagePath);
                            
                            // 파일 전송 오류 팝업 확인 및 처리
                            await new Promise((resolve) => setTimeout(resolve, 1000));
                            const errorHandled = await handleFileTransferError(page, frame);
                            
                            if (!errorHandled) {
                                uploadSuccess = true;
                                console.log(`✅ 이미지 업로드 성공: ${imagePath}`);
                            } else {
                                retryCount++;
                                console.log(`⚠️ 파일 전송 오류 발생, 재시도 ${retryCount}/${maxRetries}`);
                                await new Promise((resolve) => setTimeout(resolve, 2000)); // 2초 대기 후 재시도
                            }
                        } catch (error) {
                            retryCount++;
                            console.log(`⚠️ 이미지 업로드 오류 (${retryCount}/${maxRetries}): ${error.message}`);
                            await new Promise((resolve) => setTimeout(resolve, 2000));
                        }
                    }
                    
                    if (!uploadSuccess) {
                        console.log(`❌ 이미지 업로드 실패 (최대 재시도 초과): ${imagePath}`);
                    } else {
                        await new Promise((resolve) => setTimeout(resolve, 500));
                        await page.keyboard.press('Enter');
                        await new Promise((resolve) => setTimeout(resolve, 100));
                    }
                } else if (i >= imageFiles.length) {
                    console.log(`섹션 ${i + 1}: 이미지 생략 (이미지 수: ${imageFiles.length}, 섹션 수: ${resultData.gemini.sections.length})`);
                }
            }

            // p 내용 입력 (인용구 밖에서)
            console.log(`본문 내용 입력: ${section.p.substring(0, 50)}...`);
            await typeWithRandomDelay(page, section.p);


            // 섹션 사이 구분을 위해 엔터 두 번 (마지막 섹션 제외)
            if (i < resultData.gemini.sections.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                await page.keyboard.press('Enter');
                await new Promise((resolve) => setTimeout(resolve, 50));
                await page.keyboard.press('Enter');
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }

        // 할인 링크 섹션 추가
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await page.keyboard.press('Enter');
        await new Promise((resolve) => setTimeout(resolve, 500));
        await page.keyboard.press('Enter');
        await new Promise((resolve) => setTimeout(resolve, 500));

        // 글자 크기를 24로 변경
        await changeFontSize(page, frame, '24');
        await new Promise((resolve) => setTimeout(resolve, 500));

        // 중앙 정렬 설정
        await changeAlignment(page, frame, '가운데');
        await new Promise((resolve) => setTimeout(resolve, 500));

        // 할인율 텍스트 입력
        const affiliateProduct = resultData.상품목록.find(p => p.상품ID === resultData.선택된상품ID);
        let discountText = "할인 링크🎉 지금 확인해보세요!";

        if (affiliateProduct && affiliateProduct.할인율) {
            // 할인율에서 숫자만 추출 (예: "30%" -> "30")
            const discountRate = affiliateProduct.할인율.replace(/[^0-9]/g, '');
            if (discountRate) {
                discountText = `${discountRate}% 할인 링크🎉 지금 확인해보세요!`;
            }
        }

        console.log(`할인 텍스트 입력: ${discountText}`);
        await typeWithRandomDelay(page, discountText);

        // 엔터
        await new Promise((resolve) => setTimeout(resolve, 500));
        await page.keyboard.press('Enter');
        await new Promise((resolve) => setTimeout(resolve, 500));

        // 글자 크기를 기본으로 되돌리기
        await changeFontSize(page, frame, '15');
        await new Promise((resolve) => setTimeout(resolve, 500));

        // 가운데 정렬 상태를 유지한 채로 어필리에이트 링크 추가
        // (왼쪽 정렬 변경 코드 제거)

        // 어필리에이트 링크 추가 (oglink 모듈 사용)
        if (affiliateProduct && affiliateProduct.어필리에이트URL) {
            console.log('할인 링크 추가 중...');
            console.log('어필리에이트 URL:', affiliateProduct.어필리에이트URL);

            // oglink 모듈을 사용하여 링크 추가
            await addOgLink(page, frame, affiliateProduct.어필리에이트URL);

            // 링크 썸네일 생성 대기
            console.log('링크 썸네일 생성 대기 중...');
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // 엔터를 눌러 다음 줄로
            await page.keyboard.press('Enter');
        } else {
            console.log('어필리에이트 URL을 찾을 수 없습니다.');
        }

        // USE_VIDEO 옵션에 따라 동영상 추가 (맨 아래에)
        if (USE_VIDEO === 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            await page.keyboard.press('Enter');
            await new Promise((resolve) => setTimeout(resolve, 500));
            await page.keyboard.press('Enter');
            await new Promise((resolve) => setTimeout(resolve, 500));
            // 동영상 슬라이드쇼 생성 시도
            console.log('\n제품 이미지로 동영상 슬라이드쇼 생성 중...');
            try {
                // imgs 폴더의 이미지들로 동영상 생성
                const videoTitle = resultData.선택된상품명 ? resultData.선택된상품명.substring(0, 10) : '제품';
                const videoPath = await createSlideshow(videoTitle);
                console.log(`동영상이 생성되었습니다: ${videoPath}`);

                // 동영상 업로드
                console.log('동영상 업로드 중...');
                let videoUploadSuccess = false;
                let videoRetryCount = 0;
                const maxVideoRetries = 3;
                
                while (!videoUploadSuccess && videoRetryCount < maxVideoRetries) {
                    try {
                        await uploadVideo(page, frame, videoPath, videoTitle);
                        
                        // 파일 전송 오류 팝업 확인 및 처리
                        await new Promise((resolve) => setTimeout(resolve, 2000));
                        const errorHandled = await handleFileTransferError(page, frame);
                        
                        if (!errorHandled) {
                            videoUploadSuccess = true;
                            console.log('✅ 동영상 업로드 성공');
                        } else {
                            videoRetryCount++;
                            console.log(`⚠️ 동영상 파일 전송 오류 발생, 재시도 ${videoRetryCount}/${maxVideoRetries}`);
                            await new Promise((resolve) => setTimeout(resolve, 3000));
                        }
                    } catch (error) {
                        videoRetryCount++;
                        console.log(`⚠️ 동영상 업로드 오류 (${videoRetryCount}/${maxVideoRetries}): ${error.message}`);
                        await new Promise((resolve) => setTimeout(resolve, 3000));
                    }
                }
                
                if (!videoUploadSuccess) {
                    console.log('❌ 동영상 업로드 실패 (최대 재시도 초과), 이미지 갤러리로 대체합니다...');
                    throw new Error('동영상 업로드 재시도 한계 초과');
                }

            } catch (videoError) {
                console.error('동영상 생성 실패:', videoError.message);
                console.log('대신 이미지 갤러리로 대체합니다...');

                // 동영상 생성 실패시 이미지 갤러리로 대체
                const imgsDir = path.join(__dirname, 'imgs');
                if (fs.existsSync(imgsDir)) {
                    const imageFiles = fs.readdirSync(imgsDir)
                        .filter(file => file.startsWith('product_') && (file.endsWith('.jpg') || file.endsWith('.png')))
                        .sort((a, b) => {
                            const numA = parseInt(a.match(/product_(\d+)/)?.[1] || 0);
                            const numB = parseInt(b.match(/product_(\d+)/)?.[1] || 0);
                            return numA - numB;
                        })
                        .slice(0, 3); // 최대 3개 이미지만

                    for (let i = 0; i < imageFiles.length; i++) {
                        const imagePath = path.join(imgsDir, imageFiles[i]);
                        console.log(`갤러리 이미지 ${i + 1}/${imageFiles.length} 추가: ${imagePath}`);
                        
                        // 갤러리 이미지 업로드 시도
                        let galleryUploadSuccess = false;
                        let galleryRetryCount = 0;
                        const maxGalleryRetries = 3;
                        
                        while (!galleryUploadSuccess && galleryRetryCount < maxGalleryRetries) {
                            try {
                                await uploadImage(page, frame, imagePath);
                                
                                // 파일 전송 오류 팝업 확인 및 처리
                                await new Promise((resolve) => setTimeout(resolve, 1000));
                                const errorHandled = await handleFileTransferError(page, frame);
                                
                                if (!errorHandled) {
                                    galleryUploadSuccess = true;
                                    console.log(`✅ 갤러리 이미지 ${i + 1} 업로드 성공`);
                                } else {
                                    galleryRetryCount++;
                                    console.log(`⚠️ 갤러리 이미지 ${i + 1} 파일 전송 오류 발생, 재시도 ${galleryRetryCount}/${maxGalleryRetries}`);
                                    await new Promise((resolve) => setTimeout(resolve, 2000));
                                }
                            } catch (error) {
                                galleryRetryCount++;
                                console.log(`⚠️ 갤러리 이미지 ${i + 1} 업로드 오류 (${galleryRetryCount}/${maxGalleryRetries}): ${error.message}`);
                                await new Promise((resolve) => setTimeout(resolve, 2000));
                            }
                        }
                        
                        if (!galleryUploadSuccess) {
                            console.log(`❌ 갤러리 이미지 ${i + 1} 업로드 실패 (최대 재시도 초과)`);
                        } else {
                            await new Promise((resolve) => setTimeout(resolve, 1500));
                        }
                    }
                }
            }
        } else {
            console.log('\nUSE_VIDEO=0: 동영상 생성을 건너뜅니다.');
        }


        console.log('\n블로그 포스트 작성 완료!');
        console.log(`제목: ${resultData.gemini.h1}`);
        console.log(`섹션 수: ${resultData.gemini.sections.length}`);
        console.log(`선택된 상품: ${resultData.선택된상품명}`);

        // 파일 정리 (imgs 폴더 내용과 result.json 삭제)
        await cleanupFiles();

        await doubleCheckPopup(page, frame);

        // 발행 버튼 클릭
        console.log('\n발행 버튼을 찾는 중...');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        try {
            const publishSelectors = [
                'button.publish_btn__m9KHH',
                'button[data-click-area="tpb.publish"]',
                '.publish_btn_area__KjA2i button',
                'button:has(span.text__d09H7)',
                '.publish_btn_area__KjA2i .publish_btn__m9KHH'
            ];

            let publishClicked = false;

            // 1. iframe 내부에서 먼저 시도
            console.log('1. iframe 내부에서 발행 버튼 찾는 중...');
            for (const selector of publishSelectors) {
                try {
                    const publishBtn = await frame.$(selector);
                    if (publishBtn) {
                        await publishBtn.click();
                        console.log(`✅ iframe 내부에서 발행 버튼 클릭 성공! (선택자: ${selector})`);
                        publishClicked = true;
                        break;
                    }
                } catch (e) {
                    // 실패 시 다음 선택자 시도
                }
            }

            // iframe 내부 JavaScript로 시도
            if (!publishClicked) {
                try {
                    const result = await frame.evaluate(() => {
                        const btn = document.querySelector('button.publish_btn__m9KHH') ||
                            document.querySelector('button[data-click-area="tpb.publish"]');
                        if (btn) {
                            btn.click();
                            return true;
                        }
                        return false;
                    });
                    if (result) {
                        console.log('✅ iframe 내부 JavaScript로 발행 버튼 클릭 성공!');
                        publishClicked = true;
                    }
                } catch (e) {
                    // 실패 시 메인 페이지에서 시도
                }
            }

            // 2. 메인 페이지(iframe 밖)에서 시도
            if (!publishClicked) {
                console.log('2. 메인 페이지에서 발행 버튼 찾는 중...');
                for (const selector of publishSelectors) {
                    try {
                        const publishBtn = await page.$(selector);
                        if (publishBtn) {
                            await publishBtn.click();
                            console.log(`✅ 메인 페이지에서 발행 버튼 클릭 성공! (선택자: ${selector})`);
                            publishClicked = true;
                            break;
                        }
                    } catch (e) {
                        // 실패 시 다음 선택자 시도
                    }
                }
            }

            // 3. 메인 페이지 JavaScript로 직접 클릭 시도
            if (!publishClicked) {
                try {
                    const result = await page.evaluate(() => {
                        // 클래스명으로 찾기
                        const btn1 = document.querySelector('button.publish_btn__m9KHH');
                        if (btn1) {
                            btn1.click();
                            return 'button.publish_btn__m9KHH';
                        }

                        // data 속성으로 찾기
                        const btn2 = document.querySelector('button[data-click-area="tpb.publish"]');
                        if (btn2) {
                            btn2.click();
                            return 'button[data-click-area="tpb.publish"]';
                        }

                        // 텍스트로 찾기
                        const allButtons = document.querySelectorAll('button');
                        for (const btn of allButtons) {
                            if (btn.innerText === '발행' || btn.textContent === '발행') {
                                btn.click();
                                return 'text search';
                            }
                        }

                        return false;
                    });

                    if (result) {
                        console.log(`✅ 메인 페이지 JavaScript로 발행 버튼 클릭 성공! (방식: ${result})`);
                        publishClicked = true;
                    }
                } catch (e) {
                    console.log('JavaScript 발행 버튼 클릭 실패');
                }
            }

            if (publishClicked) {
                console.log('발행 프로세스가 시작되었습니다.');

                // 발행 설정 팝업이 나타날 때까지 대기
                await new Promise((resolve) => setTimeout(resolve, 3000));

                try {
                    // 오래된 발행 기록 파일 정리
                    cleanupOldPostedFiles(POST_ID);

                    // 발행 기록 확인 (매번 최신으로 다시 읽기)
                    const records = loadPostedRecords(POST_ID);

                    console.log(`현재 발행 횟수: ${records.length}회`);
                    if (records.length > 0) {
                        const lastRecord = records[0]; // 시간순 정렬된 첫 번째가 최신
                        console.log(`마지막 발행 시간: ${lastRecord.date} ${String(lastRecord.hour).padStart(2, '0')}:${String(lastRecord.minute).padStart(2, '0')}`);
                    }

                    // 현재 시간 가져오기 (한국 시간)
                    const kstNow = getKSTTime();
                    console.log(`🕐 현재 KST 시간: ${kstNow.getFullYear()}-${String(kstNow.getMonth()+1).padStart(2,'0')}-${String(kstNow.getDate()).padStart(2,'0')} ${String(kstNow.getHours()).padStart(2,'0')}:${String(kstNow.getMinutes()).padStart(2,'0')}`);
                    
                    // 매번 최신 발행 기록 다시 읽기
                    const latestRecords = loadPostedRecords(POST_ID);
                    
                    // 첫 발행 여부 판단: 기록 개수로만 판단
                    const isFirstPost = latestRecords.length === 0;
                    
                    console.log(`현재 발행 상황: ${isFirstPost ? '첫 발행' : (latestRecords.length + 1) + '회차 발행'}`);
                    
                    let finalHour, finalMinute, finalDate;
                    
                    // 예약 발행 선택
                    const radioExistsFrame = await frame.evaluate(() => {
                        const label = document.querySelector('label[for="radio_time2"]');
                        if (label) {
                            label.click();
                            return true;
                        }
                        return false;
                    });

                    if (!radioExistsFrame) {
                        throw new Error('예약 발행 선택 실패');
                    }

                    console.log('✅ 예약 발행 선택 완료');
                    await new Promise((resolve) => setTimeout(resolve, 2000));

                    if (isFirstPost) {
                        // 1. 첫 발행인 경우: 네이버 기본 설정 시간 추출
                        const autoSettings = await frame.evaluate(() => {
                            const hourSelect = document.querySelector('.hour_option__J_heO');
                            const minuteSelect = document.querySelector('.minute_option__Vb3xB');
                            
                            if (hourSelect && minuteSelect) {
                                return {
                                    hour: parseInt(hourSelect.value),
                                    minute: parseInt(minuteSelect.value)
                                };
                            }
                            return null;
                        });

                        if (autoSettings) {
                            finalHour = autoSettings.hour;
                            finalMinute = autoSettings.minute;
                            
                            // 네이버 기본 설정 시간의 날짜 계산 (현재 시간 + 10분 기준)
                            const scheduledTime = new Date(kstNow.getTime() + 10 * 60000);
                            const year = scheduledTime.getFullYear();
                            const month = String(scheduledTime.getMonth() + 1).padStart(2, '0');
                            const day = String(scheduledTime.getDate()).padStart(2, '0');
                            finalDate = `${year}-${month}-${day}`;
                            
                            console.log(`✅ 네이버 기본 설정 시간: ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}, 날짜: ${finalDate}`);
                        } else {
                            throw new Error('네이버 기본 설정 시간 추출 실패');
                        }
                    } else {
                        // 2. 2회차 이상인 경우: calculateNextPostTime으로 다음 시간 계산
                        const postTime = calculateNextPostTime(latestRecords);
                        
                        // calculateNextPostTime에서 반환된 완전한 날짜 시간 객체 사용
                        const scheduledTime = postTime.scheduledTime;
                        
                        finalHour = postTime.hour;
                        finalMinute = postTime.minute;
                        
                        // 날짜 문자열 생성
                        const year = scheduledTime.getFullYear();
                        const month = String(scheduledTime.getMonth() + 1).padStart(2, '0');
                        const day = String(scheduledTime.getDate()).padStart(2, '0');
                        finalDate = `${year}-${month}-${day}`;
                        
                        const isNextDay = scheduledTime.getDate() !== kstNow.getDate() || 
                                         scheduledTime.getMonth() !== kstNow.getMonth() || 
                                         scheduledTime.getFullYear() !== kstNow.getFullYear();
                                         
                        console.log(`✅ 계산된 다음 발행 시간: ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')} ${isNextDay ? '(다음날)' : '(오늘)'}`);
                        
                        // 날짜 변경이 필요한 경우
                        if (isNextDay) {
                            console.log(`날짜를 변경합니다: ${kstNow.getFullYear()}-${String(kstNow.getMonth()+1).padStart(2,'0')}-${String(kstNow.getDate()).padStart(2,'0')} → ${String(scheduledTime.getFullYear())}-${String(scheduledTime.getMonth()+1).padStart(2,'0')}-${String(scheduledTime.getDate()).padStart(2,'0')}`);
                            
                            // 달력 열기
                            await frame.click('.input_date__QmA0s');
                            await new Promise(resolve => setTimeout(resolve, 1500));
                            
                            // 달력이 열린 후 현재 달력의 월 확인
                            const initialCalendarState = await frame.evaluate(() => {
                                const monthSpan = document.querySelector('.ui-datepicker-month');
                                const yearSpan = document.querySelector('.ui-datepicker-year');
                                return {
                                    month: monthSpan ? monthSpan.textContent : null,
                                    year: yearSpan ? yearSpan.textContent : null
                                };
                            });
                            console.log(`📅 달력 초기 상태: ${initialCalendarState.year} ${initialCalendarState.month}`);
                            
                            const targetDate = scheduledTime.getDate();
                            const targetYear = scheduledTime.getFullYear();
                            const targetMonth = scheduledTime.getMonth();
                            
                            // 실제 달력에 표시된 월을 파싱해서 사용 (한국어 "9월" → 숫자 8)
                            const calendarMonth = initialCalendarState.month ? 
                                parseInt(initialCalendarState.month.replace('월', '')) - 1 : // "9월" → 8
                                kstNow.getMonth(); // fallback
                            const calendarYear = initialCalendarState.year ? 
                                parseInt(initialCalendarState.year.replace('년', '')) : // "2025년" → 2025
                                kstNow.getFullYear(); // fallback
                            
                            console.log(`🎯 목표: ${targetYear}년 ${targetMonth + 1}월 ${targetDate}일`);
                            console.log(`📍 달력 현재: ${calendarYear}년 ${calendarMonth + 1}월`);
                            
                            // 실제 달력 표시 월을 기준으로 계산
                            let monthsToMove = 0;
                            if (targetYear > calendarYear) {
                                // 다음 연도인 경우
                                monthsToMove = (12 - calendarMonth - 1) + targetMonth + 1;
                                console.log(`📊 연도 넘김: ${calendarYear} → ${targetYear}, 이동할 월 수: ${monthsToMove}`);
                            } else if (targetYear === calendarYear) {
                                // 같은 연도 내에서 월 비교
                                monthsToMove = targetMonth - calendarMonth;
                                console.log(`📊 같은 연도 내: ${calendarMonth + 1}월 → ${targetMonth + 1}월, 이동할 월 수: ${monthsToMove}`);
                            } else if (targetYear < calendarYear) {
                                // 이전 연도인 경우 (거의 없지만 혹시)
                                console.log(`⚠️ 경고: 목표 연도가 달력 현재 연도보다 이전입니다!`);
                                monthsToMove = 0; // 안전하게 0으로 설정
                            }
                            
                            console.log(`📋 최종 계산: ${monthsToMove}개월 이동 필요`);
                            
                            // 필요한 만큼 다음달 버튼 클릭 (안전하게 한 번에 하나씩)
                            for (let i = 0; i < monthsToMove; i++) {
                                console.log(`다음달 버튼 클릭 ${i + 1}/${monthsToMove}`);
                                
                                // 버튼이 존재하는지 확인 후 클릭
                                const nextButtonExists = await frame.evaluate(() => {
                                    const btn = document.querySelector('.ui-datepicker-next');
                                    return btn && !btn.disabled && btn.style.visibility !== 'hidden';
                                });
                                
                                if (nextButtonExists) {
                                    await frame.click('.ui-datepicker-next');
                                    await new Promise(resolve => setTimeout(resolve, 800)); // 각 클릭 후 충분한 대기
                                    
                                    // 실제로 달력이 변경되었는지 확인
                                    const currentCalendarMonth = await frame.evaluate(() => {
                                        const monthSpan = document.querySelector('.ui-datepicker-month');
                                        return monthSpan ? monthSpan.textContent : null;
                                    });
                                    console.log(`현재 달력 월: ${currentCalendarMonth}`);
                                } else {
                                    console.log('⚠️ 다음달 버튼을 찾을 수 없거나 비활성화됨');
                                    break;
                                }
                            }
                            
                            // 추가 대기 후 날짜 선택
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            
                            // 목표 날짜 클릭
                            const dateClicked = await frame.evaluate((date) => {
                                const dateButtons = document.querySelectorAll('.ui-datepicker td:not(.ui-state-disabled) button');
                                console.log(`사용 가능한 날짜 버튼 수: ${dateButtons.length}`);
                                
                                for (const btn of dateButtons) {
                                    if (btn.textContent.trim() === String(date)) {
                                        console.log(`날짜 ${date}일 버튼 찾음, 클릭 시도`);
                                        btn.click();
                                        return true;
                                    }
                                }
                                return false;
                            }, targetDate);
                            
                            if (dateClicked) {
                                console.log(`✅ 날짜 ${targetDate}일 선택 완료`);
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            } else {
                                console.log(`⚠️ 날짜 ${targetDate}일 선택 실패 - 해당 날짜를 찾을 수 없습니다`);
                            }
                        }
                        
                        // 시간과 분 설정
                        const hourSet = await frame.evaluate((hour) => {
                            const hourSelect = document.querySelector('.hour_option__J_heO');
                            if (hourSelect) {
                                hourSelect.value = String(hour).padStart(2, '0');
                                hourSelect.dispatchEvent(new Event('change', { bubbles: true }));
                                return true;
                            }
                            return false;
                        }, finalHour);
                        
                        const minuteSet = await frame.evaluate((minute) => {
                            const minuteSelect = document.querySelector('.minute_option__Vb3xB');
                            if (minuteSelect) {
                                minuteSelect.value = String(minute).padStart(2, '0');
                                minuteSelect.dispatchEvent(new Event('change', { bubbles: true }));
                                return true;
                            }
                            return false;
                        }, finalMinute);
                        
                        if (!hourSet || !minuteSet) {
                            throw new Error('시간 설정 실패');
                        }
                        
                        console.log(`✅ 예약 시간 설정 완료: ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}`);
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                    }
                    
                    // 3. 최종 발행 기록 저장 (한 번만 저장)
                    savePostedRecord(POST_ID, finalHour, finalMinute, finalDate);
                    console.log(`발행 기록 저장 완료: ${finalDate} ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}`);

                    // 4. 최종 발행 버튼 클릭
                    await frame.waitForSelector('button[data-testid="seOnePublishBtn"]', { timeout: 3000 });
                    await frame.click('button[data-testid="seOnePublishBtn"]');
                    console.log('✅ 발행 완료!');

                    // 발행 처리 완료 대기
                    await new Promise((resolve) => setTimeout(resolve, 3000));

                    // 5. 브라우저 종료
                    console.log('발행이 완료되어 브라우저를 종료합니다.');
                    await browser.close();
                    process.exit(0);

                } catch (settingsError) {
                    console.error('발행 설정 처리 중 오류:', settingsError.message);
                }

                // 발행 설정 처리 후 종료 (위의 try-catch 블록에서 처리됨)
            } else {
                console.log('발행 버튼을 찾을 수 없습니다. 수동으로 발행해주세요.');
                // 발행 버튼을 찾지 못해도 브라우저 종료
                await browser.close();
                process.exit(1);
            }

        } catch (error) {
            console.error('발행 버튼 클릭 중 오류:', error.message);
            // 오류 발생 시에도 브라우저 종료
            await browser.close();
            process.exit(1);
        }

        // 이 부분은 실행되지 않음 (위에서 이미 종료)

    } catch (error) {
        console.error("글쓰기 중 오류 발생:", error.message);
    }
}

// 블로그 ID 추출 함수
async function fetchBlogId(cookieString) {
    try {
        const response = await axios.get('https://section.blog.naver.com/ajax/BlogUserInfo.naver', {
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'ko,en-US;q=0.9,en;q=0.8',
                'cache-control': 'no-cache',
                'cookie': cookieString,
                'pragma': 'no-cache',
                'referer': 'https://section.blog.naver.com/BlogHome.naver',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
            }
        });

        // 응답 데이터 파싱
        let responseData = response.data;
        if (typeof responseData === 'string') {
            // ")]}',\n" 제거
            responseData = responseData.replace(/^\)\]\}',\n/, '');
            responseData = JSON.parse(responseData);
        }

        if (responseData.result && responseData.result.domainIdOrUserId) {
            return responseData.result.domainIdOrUserId;
        }

        return null;
    } catch (error) {
        console.error('블로그 ID 추출 실패:', error.message);
        return null;
    }
}

// cookies JSON 파일 업데이트 함수
function updateCookiesJsonWithBlogId(userId, blogId) {
    const cookieFilePath = getCookieFilePath(userId);
    if (fs.existsSync(cookieFilePath)) {
        try {
            const loginData = JSON.parse(fs.readFileSync(cookieFilePath, 'utf8'));
            loginData.blogId = blogId;
            fs.writeFileSync(cookieFilePath, JSON.stringify(loginData, null, 2));
            console.log(`블로그 ID (${blogId})를 cookies JSON에 저장했습니다.`);
        } catch (error) {
            console.error('cookies JSON 파일 업데이트 실패:', error);
        }
    }
}

async function visitNaver() {
    // 환경변수 체크
    if (!POST_ID || !POST_PASSWORD) {
        console.error('환경변수에 POST_ID, POST_PASSWORD가 설정되어야 합니다.');
        console.error('현재 설정:');
        console.error(`  POST_ID: ${POST_ID ? '설정됨' : '미설정'}`);
        console.error(`  POST_PASSWORD: ${POST_PASSWORD ? '설정됨' : '미설정'}`);
        return;
    }

    // cookies JSON 파일 확인, 없으면 로그인 실행
    // let cookieFilePath = getCookieFilePath(POST_ID);
    // if (!fs.existsSync(cookieFilePath)) {
    //     console.log('cookies JSON 파일이 없습니다. login-module을 실행합니다...');
    //     const loginSuccess = await login(POST_ID, POST_PASSWORD);

    //     if (!loginSuccess) {
    //         console.error('로그인에 실패했습니다.');
    //         return;
    //     }

    //     console.log('로그인 성공!');
    //     // 로그인 후 다시 쿠키 파일 경로 확인
    //     cookieFilePath = getCookieFilePath(POST_ID);
    // }

    // cookies JSON에서 블로그 ID 확인
    // if (fs.existsSync(cookieFilePath)) {
        // try {
        //     // const loginData = JSON.parse(fs.readFileSync(cookieFilePath, 'utf8'));
        //     const loginData = cookieJSON;

        //     // // cookies를 문자열로 변환
        //     // let cookieString = '';
        //     // if (Array.isArray(loginData)) {
        //     //     cookieString = loginData.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
        //     // } else if (loginData.cookies) {
        //     //     cookieString = loginData.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
        //     // }

        //     // 블로그 ID가 없거나 비어있으면 추출
        //     // if (!loginData.blogId || loginData.blogId === '') {
        //     //     console.log('블로그 ID가 없습니다. 자동으로 추출합니다...');
        //     //     if (cookieString) {
        //     //         const extractedBlogId = await fetchBlogId(cookieString);
        //     //         if (extractedBlogId) {
        //     //             BLOG_ID = extractedBlogId;
        //     //             updateCookiesJsonWithBlogId(POST_ID, BLOG_ID);
        //     //             console.log(`블로그 ID 추출 성공: ${BLOG_ID}`);
        //     //         } else {
        //     //             console.error('블로그 ID를 추출할 수 없습니다.');
        //     //             return;
        //     //         }
        //     //     }
        //     // } else {
        //     //     BLOG_ID = loginData.blogId;
        //     //     console.log(`저장된 블로그 ID 사용: ${BLOG_ID}`);
        //     // }
        // } catch (error) {
        //     console.error('cookies JSON 파일 읽기 실패:', error);
        // }
    // }

    // if (!BLOG_ID) {
    //     console.error('블로그 ID를 확인할 수 없습니다.');
    //     return;
    // }

    // 임시 userDataDir 생성
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naver-post-'));
    console.log(`임시 프로필 디렉토리 생성: ${tempDir}`);

    // Chrome 경로 찾기
    const chromePath = findChromePath();

    // 브라우저 실행 (자동화 탐지 우회 설정)
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        userDataDir: tempDir,
        executablePath: chromePath, // 시스템 Chrome 사용
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-web-security",
            "--disable-features=VizDisplayCompositor",
            "--disable-blink-features=AutomationControlled", // 자동화 탐지 방지
            "--no-first-run",
            "--disable-default-apps",
            "--disable-popup-blocking",
            "--disable-translate",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
            "--disable-ipc-flooding-protection",
            "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ],
    });

    // 브라우저 종료 감지 이벤트 리스너 추가
    // 브라우저가 종료되면 스크립트도 종료
    browser.on('disconnected', () => {
        console.log('브라우저가 종료되었습니다. 프로그램을 종료합니다.');
        process.exit(0);
    });

    try {
        const page = (await browser.pages())[0];

        // 페이지가 닫히면 브라우저도 종료
        page.on('close', () => {
            console.log('페이지가 닫혔습니다. 브라우저를 종료합니다.');
            browser.close().catch(() => { });
        });

        // 자동화 탐지 우회 스크립트 주입
        await page.evaluateOnNewDocument(() => {
            // webdriver 속성 제거
            Object.defineProperty(navigator, "webdriver", {
                get: () => undefined,
            });

            // plugins 배열 추가
            Object.defineProperty(navigator, "plugins", {
                get: () => [1, 2, 3, 4, 5],
            });

            // languages 설정
            Object.defineProperty(navigator, "languages", {
                get: () => ["ko-KR", "ko", "en-US", "en"],
            });

            // permissions 처리
            const originalQuery = window.navigator.permissions.query;
            return (window.navigator.permissions.query = (parameters) =>
                parameters.name === "notifications"
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters));
        });

        // User-Agent 설정
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );

        // 추가 헤더 설정
        await page.setExtraHTTPHeaders({
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        });

        // 저장된 쿠키가 있으면 로드 (loadLoginData 내부에서 페이지 이동 처리)
        const hasStoredData = await loadLoginData(page, POST_ID, cookieJSON);

        if (!hasStoredData) {
            // 저장된 데이터가 없으면 새로 네이버로 이동
            await page.goto("https://www.naver.com", {
                waitUntil: "networkidle2",
            });
        }

        console.log("네이버에 성공적으로 접속했습니다!");
        console.log(`임시 프로필 경로: ${tempDir}`);
        if (hasStoredData) {
            console.log("저장된 로그인 데이터를 사용합니다.");
        }

        const title = await page.title();
        console.log("페이지 제목:", title);
        // await new Promise((resolve) => setTimeout(resolve, 30000)); // 잠시 대기

        // 로그인 상태 확인 및 로그인 시도
        try {
            // 먼저 로그인 상태 확인
            // const isLoggedIn = await page.evaluate(() => {
            //     // 로그인된 상태에서 나타나는 요소들 확인
            //     const profileElements = [
            //         '.MyView-module__my_area___j_4_D', // 마이 영역
            //         '.MyView-module__profile_area___2wQg4', // 프로필 영역
            //         '.MyView-module__user_info___1wWqg' // 사용자 정보
            //     ];

            //     return profileElements.some(selector => document.querySelector(selector));
            // });

            // if (!isLoggedIn) {
            //     // 쿠키 파일이 없거나 로그인이 필요한 경우 login-module 사용
            //     const cookieFilePath = getCookieFilePath(POST_ID);
            //     if (!fs.existsSync(cookieFilePath)) {
            //         console.log("저장된 쿠키가 없습니다. login-module을 사용하여 로그인합니다...");

            //         // 브라우저 닫기
            //         await browser.close();

            //         // login-module 사용하여 로그인
            //         const loginSuccess = await login(POST_ID, POST_PASSWORD);

            //         if (!loginSuccess) {
            //             console.error("로그인에 실패했습니다.");
            //             return;
            //         }

            //         console.log("로그인 성공! 다시 브라우저를 시작합니다...");

            //         // 브라우저 재시작 및 쿠키 로드하여 계속 진행
            //         await visitNaver();
            //         return;
            //     }
            // }

            console.log("로그인되어 있습니다.");

            // 블로그 글쓰기 페이지로 이동
            console.log(`블로그 글쓰기 페이지로 이동합니다... (블로그명: ${BLOG_ID})`);
            await new Promise((resolve) => setTimeout(resolve, 2000)); // 잠시 대기
            await page.goto(`https://blog.naver.com/${BLOG_ID}?Redirect=Write&categoryNo=${userJSON.blogCateId}`, {
                waitUntil: "networkidle2",
            });
            console.log("블로그 글쓰기 페이지로 이동했습니다.");

            // 글쓰기 작업 수행
            await writePost(page, browser);

        } catch (loginError) {
            console.log("로그인 과정에서 오류가 발생했습니다:", loginError.message);
        }

        // 브라우저가 열려있는 동안 계속 실행 (사용자가 브라우저를 직접 종료할 때까지)
        console.log("브라우저가 열려있습니다. 브라우저를 종료하면 프로그램도 자동으로 종료됩니다.");

        // 무한 대기 (브라우저 종료 시 disconnected 이벤트로 프로세스 종료)
        while (browser.isConnected()) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

    } catch (error) {
        console.error("오류 발생:", error);
    } finally {
        // 브라우저가 아직 연결되어 있다면 종료
        if (browser.isConnected()) {
            await browser.close();
        }

        // 임시 디렉토리 삭제
        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
                console.log('임시 프로필 디렉토리가 삭제되었습니다.');
            }
        } catch (error) {
            console.error('임시 디렉토리 삭제 실패:', error.message);
        }

        console.log("프로그램이 종료되었습니다.");
    }
}

// 정리 함수 - imgs 폴더 내용과 result.json 삭제
async function cleanupFiles() {
    try {
        console.log('\n파일 정리를 시작합니다...');

        // 1. imgs 폴더의 모든 파일 삭제
        const imgsDir = path.join(__dirname, 'imgs');
        if (fs.existsSync(imgsDir)) {
            const files = fs.readdirSync(imgsDir);
            for (const file of files) {
                const filePath = path.join(imgsDir, file);
                try {
                    fs.unlinkSync(filePath);
                    console.log(`삭제됨: ${file}`);
                } catch (err) {
                    console.error(`${file} 삭제 실패:`, err.message);
                }
            }
            console.log('imgs 폴더 정리 완료');
        } else {
            console.log('imgs 폴더가 존재하지 않습니다.');
        }

        // 2. result.json 파일 삭제
        const resultPath = path.join(__dirname, 'result.json');
        if (fs.existsSync(resultPath)) {
            fs.unlinkSync(resultPath);
            console.log('result.json 파일 삭제 완료');
        } else {
            console.log('result.json 파일이 존재하지 않습니다.');
        }

        // 3. 동영상 파일 삭제 (있는 경우)
        const files = fs.readdirSync(__dirname);
        const videoFiles = files.filter(file => file.endsWith('_slideshow.mp4'));
        for (const videoFile of videoFiles) {
            const videoPath = path.join(__dirname, videoFile);
            try {
                fs.unlinkSync(videoPath);
                console.log(`동영상 삭제됨: ${videoFile}`);
            } catch (err) {
                console.error(`${videoFile} 삭제 실패:`, err.message);
            }
        }

        console.log('파일 정리가 완료되었습니다.\n');

    } catch (error) {
        console.error('파일 정리 중 오류:', error.message);
    }
}

// 함수 실행
visitNaver();