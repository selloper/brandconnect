const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");

// Chrome 실행 파일 경로 찾기 함수
function findChromePath() {
  const platform = os.platform();
  let chromePaths = [];

  if (platform === 'win32') {
    chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
    ];
  } else if (platform === 'darwin') {
    chromePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(os.homedir(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ];
  } else {
    chromePaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    ];
  }

  for (const chromePath of chromePaths) {
    if (fs.existsSync(chromePath)) {
      console.log(`Chrome 경로를 찾았습니다: ${chromePath}`);
      return chromePath;
    }
  }

  console.log('Chrome을 찾을 수 없습니다. 기본 설정을 사용합니다.');
  return null;
}

// 쿠키 파일 경로 가져오기
function getCookieFilePath(userId) {
  const cookiesDir = path.join(path.dirname(__dirname), 'cookies');
  if (!fs.existsSync(cookiesDir)) {
    fs.mkdirSync(cookiesDir);
  }
  return path.join(cookiesDir, `${userId}_cookies.json`);
}

// 로컬 스토리지 데이터 추출
async function getLocalStorage(page) {
  try {
    const localStorage = await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        items[key] = window.localStorage.getItem(key);
      }
      return items;
    });
    return localStorage;
  } catch (error) {
    console.error('로컬 스토리지 추출 오류:', error);
    return {};
  }
}

// 세션 스토리지 데이터 추출
async function getSessionStorage(page) {
  try {
    const sessionStorage = await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        items[key] = window.sessionStorage.getItem(key);
      }
      return items;
    });
    return sessionStorage;
  } catch (error) {
    console.error('세션 스토리지 추출 오류:', error);
    return {};
  }
}

// 로컬 스토리지 데이터 복원
async function setLocalStorage(page, data) {
  try {
    await page.evaluate((storageData) => {
      Object.keys(storageData).forEach(key => {
        window.localStorage.setItem(key, storageData[key]);
      });
    }, data);
    console.log('로컬 스토리지 복원 완료');
  } catch (error) {
    console.error('로컬 스토리지 복원 오류:', error);
  }
}

// 세션 스토리지 데이터 복원
async function setSessionStorage(page, data) {
  try {
    await page.evaluate((storageData) => {
      Object.keys(storageData).forEach(key => {
        window.sessionStorage.setItem(key, storageData[key]);
      });
    }, data);
    console.log('세션 스토리지 복원 완료');
  } catch (error) {
    console.error('세션 스토리지 복원 오류:', error);
  }
}

// 블로그 ID 추출 함수
async function extractBlogId(cookies) {
  try {
    const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    
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
      console.log(`블로그 ID 추출 성공: ${responseData.result.domainIdOrUserId}`);
      return responseData.result.domainIdOrUserId;
    }
    
    console.log('블로그 ID를 찾을 수 없습니다.');
    return null;
  } catch (error) {
    console.error('블로그 ID 추출 오류:', error.message);
    return null;
  }
}

// 네이버 쇼핑 커넥트 space-id 추출
async function extractSpaceId(page) {
  try {
    await page.goto('https://brandconnect.naver.com/', { 
      waitUntil: 'networkidle0', 
      timeout: 30000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const currentUrl = page.url();
    console.log('현재 URL:', currentUrl);
    
    const match = currentUrl.match(/brandconnect\.naver\.com\/(\d+)\//)
    
    if (match && match[1]) {
      console.log(`Space ID 추출 성공: ${match[1]}`);
      return match[1];
    }
    
    const spaceId = await page.evaluate(() => {
      if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.space) {
        return window.__INITIAL_STATE__.space.id;
      }
      const scripts = document.querySelectorAll('script');
      for (let script of scripts) {
        const content = script.textContent;
        const match = content.match(/"spaceId":"(\d+)"|spaceId["']?:\s*["'](\d+)["']/);
        if (match) {
          return match[1] || match[2];
        }
      }
      return null;
    });
    
    if (spaceId) {
      console.log(`Space ID 추출 성공: ${spaceId}`);
      return spaceId;
    }
    
    console.log('Space ID를 찾을 수 없습니다.');
    return null;
  } catch (error) {
    console.error('Space ID 추출 오류:', error);
    return null;
  }
}

// JSON 파일에 쿠키와 스토리지 데이터 저장
async function saveLoginData(page, userId) {
  try {
    await page.goto('https://www.naver.com', { waitUntil: 'networkidle0', timeout: 30000 });
    
    const cookies = await page.cookies();
    const localStorage = await getLocalStorage(page);
    const sessionStorage = await getSessionStorage(page);
    const spaceId = await extractSpaceId(page);
    const blogId = await extractBlogId(cookies);
    
    // Space ID와 Blog ID를 cookies JSON 파일에 저장
    if (spaceId) {
      console.log(`Space ID (${spaceId})를 cookies JSON에 저장했습니다.`);
    }
    if (blogId) {
      console.log(`Blog ID (${blogId})를 cookies JSON에 저장했습니다.`);
    }
    
    const loginData = {
      cookies: cookies,
      localStorage: localStorage,
      sessionStorage: sessionStorage,
      userAgent: await page.evaluate(() => navigator.userAgent),
      spaceId: spaceId,
      blogId: blogId,
      savedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(getCookieFilePath(userId), JSON.stringify(loginData, null, 2));
    console.log(`로그인 데이터가 cookies/${userId}_cookies.json 파일에 저장되었습니다.`);
    return true;
  } catch (error) {
    console.error('로그인 데이터 저장 오류:', error);
    return false;
  }
}

// JSON 파일에서 쿠키와 스토리지 데이터 불러오기
async function loadLoginData(page, userId, cookieJSON) {
  const cookieFilePath = getCookieFilePath(userId);
  // if (fs.existsSync(cookieFilePath)) {
    try {
      // const dataString = fs.readFileSync(cookieFilePath);
      const loginData = {"cookies": cookieJSON};
      
      // 구버전 호환성 체크
      if (Array.isArray(loginData)) {
        await page.setCookie(...loginData);
        console.log("JSON 파일에서 쿠키를 불러왔습니다. (구버전)");
        return true;
      }
      
      // 신버전 데이터 처리
      if (loginData.cookies) {
        await page.setCookie(...loginData.cookies);
      }
      
      await page.goto('https://www.naver.com', { waitUntil: 'networkidle0', timeout: 30000 });
      
      if (loginData.localStorage) {
        await setLocalStorage(page, loginData.localStorage);
      }
      
      if (loginData.sessionStorage) {
        await setSessionStorage(page, loginData.sessionStorage);
      }
      
      if (loginData.userAgent) {
        await page.setUserAgent(loginData.userAgent);
      }
      
      console.log("JSON 파일에서 로그인 데이터를 불러왔습니다.");
      return true;
    } catch (error) {
      console.error("로그인 데이터 로드 오류:", error);
      return false;
    }
  // }
  return false;
}

// 로그인 상태 확인
async function checkLoginStatus(page) {
  try {
    await page.goto("https://www.naver.com", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    const loginButton = await page.$(".MyView-module__my_login___tOTgr");
    if (loginButton) {
      console.log("로그인이 필요합니다.");
      return false;
    } else {
      console.log("이미 로그인된 상태입니다.");
      return true;
    }
  } catch (error) {
    console.error("로그인 상태 확인 중 에러:", error);
    return false;
  }
}

// 실제 로그인 수행
async function performLogin(page, userId, userPw) {
  try {
    await page.goto("https://nid.naver.com/nidlogin.login", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    console.log("네이버 로그인 페이지 접속 완료");

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await page.evaluate(
      (id) => {
        document.querySelector("#id").value = id;
      },
      userId
    );
    console.log("아이디 입력 완료");
    
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    await page.evaluate(
      (pw) => {
        document.querySelector("#pw").value = pw;
      },
      userPw
    );
    console.log("비밀번호 입력 완료");

    const keepLoginCheckbox = await page.$("#keep");
    const isChecked = await page.evaluate(
      (el) => el.checked,
      keepLoginCheckbox
    );
    if (!isChecked) {
      await keepLoginCheckbox.click();
      console.log("로그인 상태 유지 체크 완료");
    }

    const ipSecurityCheckbox = await page.$("#switch");
    const isIpSecurityOn = await page.evaluate(
      (el) => el.value === "on",
      ipSecurityCheckbox
    );
    if (isIpSecurityOn) {
      await ipSecurityCheckbox.click();
      console.log("IP 보안 OFF 설정 완료");
    }

    await page.click(".btn_login");
    console.log("로그인 버튼 클릭 완료");

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const errorElement = await page.$('#err_common .error_message');
    if (errorElement) {
      const errorMessage = await page.evaluate(el => el.textContent, errorElement);
      console.log("로그인 에러 발생:", errorMessage);
      return false;
    }

    await saveLoginData(page, userId);
    return true;
  } catch (error) {
    console.error("로그인 중 에러 발생:", error);
    return false;
  }
}

// 로그인 모듈 메인 함수
async function login(userId, userPw) {
  const userDataDir = path.resolve(path.dirname(__dirname), 'userdata', `profile_${Date.now()}`);
  console.log(`userId: ${userId}`);
  console.log(`userPw: ${userPw}`);

  console.log(`브라우저 프로필 경로: ${userDataDir}`);
  
  if (!fs.existsSync(path.dirname(userDataDir))) {
    fs.mkdirSync(path.dirname(userDataDir), { recursive: true });
  }

  const chromePath = findChromePath();
  
  const browserOptions = {
    headless: false,
    ignoreHTTPSErrors: true,
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-infobars",
      "--disable-automation",
      "--disable-blink-features=AutomationControlled",
      "--ignore-certificate-errors",
      "--start-maximized",
    ],
    userDataDir: userDataDir,
  };
  
  console.log(`1111`);
  
  if (chromePath) {
    browserOptions.executablePath = chromePath;
  }

  let browser;
  try {
    browser = await puppeteer.launch(browserOptions);
    
    const pages = await browser.pages();
    if (pages.length > 0) {
      await pages[0].close();
    }
    
    console.log(`222`);
    const page = await browser.newPage();
    console.log(`333`);
    // 브라우저 설정
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });
    });

    let isLoggedIn = false;
    let needsSpaceId = false;
    
    // 1. 저장된 쿠키로 로그인 시도
    const cookiesLoaded = await loadLoginData(page, userId);
    if (cookiesLoaded) {
      isLoggedIn = await checkLoginStatus(page);
      if (isLoggedIn) {
        console.log("저장된 쿠키로 로그인 성공");
        
        // Space ID와 Blog ID가 있는지 확인
        const cookieFilePath = getCookieFilePath(userId);
        if (fs.existsSync(cookieFilePath)) {
          const loginData = JSON.parse(fs.readFileSync(cookieFilePath, 'utf8'));
          if (!loginData.spaceId || !loginData.blogId) {
            console.log("Space ID 또는 Blog ID가 없습니다. 추출을 시도합니다...");
            needsSpaceId = true;
          }
        }
      } else {
        console.log("저장된 쿠키로 로그인 실패");
      }
    }

    // 2. 새로운 로그인 수행
    if (!isLoggedIn) {
      console.log("새로운 로그인 시도");
      isLoggedIn = await performLogin(page, userId, userPw);
    }
    
    // 3. 로그인은 되었지만 Space ID가 필요한 경우
    if (isLoggedIn && needsSpaceId) {
      console.log("Space ID 추출을 위해 데이터를 저장합니다...");
      await saveLoginData(page, userId);
    }

    await browser.close();
    
    // userdata 폴더 삭제
    if (fs.existsSync(userDataDir)) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
        console.log(`userdata 폴더를 삭제했습니다: ${userDataDir}`);
      } catch (error) {
        console.error(`userdata 폴더 삭제 실패: ${error.message}`);
      }
    }
    
    return isLoggedIn;
    
  } catch (error) {
    console.error("로그인 모듈 에러:", error);
    if (browser && browser.isConnected()) {
      await browser.close();
    }
    
    // 에러 발생 시에도 userdata 폴더 삭제
    if (fs.existsSync(userDataDir)) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch (error) {
        console.error(`userdata 폴더 삭제 실패: ${error.message}`);
      }
    }
    
    return false;
  }
}

module.exports = {
  login,
  loadLoginData,
  saveLoginData,
  checkLoginStatus,
  getCookieFilePath
};