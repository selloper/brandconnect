// npm install axios form-data xml2js axios-cookiejar-support tough-cookie uuid sharp @google/generative-ai puppeteer canvas
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const xml2js = require('xml2js');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const { exec } = require('child_process');
const mysql = require('mysql2/promise');
const crypto = require("crypto");


const user = process.argv[3];
const userJSON = JSON.parse(user);
console.log('받은 userJSON:', userJSON);

let geminiKeys = [];
let allConfig = null;
let dbConfigPost = {};
const pic_type = 'real';

let AFFILIATE_ID;
let CHANNEL_ID;
let DEFAULT_URL;
let TOTAL_IMG_COUNT = 0;
let dbConfig = {};
let CAFE_ID;
let CAFE_NAME;
let CAFE_URL;

const BLOG_ID = userJSON.blogId;
const USER_ID = userJSON.id; // 네이버 아이디 
const partnerNotice = '이 포스팅은 파트너스 활동의 일환으로 소정의 수수료를 받을수 있습니다.'
const UPDATE_LINK = 0; // 0: 본문 링크, 1: 댓글 링크
const OPEN_TYPE = 2; // 0: 비공개, 2: 공개
const MY_EMAIL = 'exslick@gmail.com'; // 본인 이메일 (네이버 블로그에 등록된 이메일)


const CATEGORY_ID = userJSON.blogCateId;

let useProxy;
let httpsAgent;
let userCookies;

let SESSION_FILE = null; 


const configInfo = async () => {
  let connection = null;
  try {
    // const filePath = path.join(__dirname, 'config.json'); // 현재 디렉토리 기준
    // const jsonData = fs.readFileSync(filePath, 'utf-8');
    connection = await mysql.createConnection(
      {
        "host": "43.203.78.203",
        "user": "root",
        "password": "twy3276!!",
        "database": "naver_post"
      }
    );
        
    const [rows] = await connection.execute(`
      SELECT
        operation 
      FROM cafe_config
      WHERE id = 1
    `);

    await connection.end();

    console.log('데이타베이스에서 컨피그 정보를 성공적으로 불러왔습니다.');
    
    const config = JSON.parse(rows[0]["operation"]);
    console.log('✅ 컨피그 파일 로드 완료:');

    geminiKeys = config.geminiKeys || [];
    allConfig = config;

    dbConfig = config.database.coupang;
    dbConfigPost = config.database.naverPost;

    return config;
  } catch (error) {
    console.error('❌ JSON 파일 로딩 실패:', error);
  }finally{
    await connection.end();
  }
}

function getServerIP() {
  const interfaces = os.networkInterfaces();
  // console.log('interfaces ---> ', interfaces);
  const results = [];

  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        results.push(iface.address);
      }
    }
  }

  return results;
}

async function getPublicIP() {
  return new Promise((resolve, reject) => {
    https.get('https://api.ipify.org?format=json', (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const ip = JSON.parse(data).ip;
          resolve(ip);
        } catch (err) {
          reject(new Error('JSON 파싱 실패: ' + err.message));
        }
      });
    }).on('error', (err) => {
      reject(new Error('HTTP 요청 실패: ' + err.message));
    });
  });
}

async function loadAllCookies(){
  let connection = null;
  try {

    connection = await mysql.createConnection(dbConfigPost);
    const [rows] = await connection.execute(`
      SELECT
        user_id as userId, 
        cookie 
      FROM cafe_cookie
    `);

    await connection.end();

    console.log('데이타베이스에서 쿠키 정보를 성공적으로 불러왔습니다.');
    userCookies = rows;

    // userCookies.forEach(cookie =>{
    //   console.log(cookie.userId)
    //   console.log(cookie.cookie)
    // });

    // const tmp = userCookies.find(cookie => cookie.userId === 'ymqrre83388');
    // console.log(tmp.userId);
    // console.log(JSON.parse(tmp.cookie));
    

  } catch (error) {
    console.error('데이타베이스에서 쿠키 정보 처리중 오류가 발생했습니다:', error);
  }finally{
    await connection.end();
  }
}

async function getValidUsers(){
  try {
    const hostname = os.hostname();
    console.log('호스트 이름:', hostname);
    console.log('서버 IP 주소:', getServerIP());
    
    let thisPublicIP;
    
    try {
      thisPublicIP = await getPublicIP();
      console.log('🌐 퍼블릭 IP:', thisPublicIP);
    } catch (err) {
      console.error('❌ 퍼블릭 IP 조회 실패:', err.message);
    }

    console.log('thisPublicIP  ---- ', thisPublicIP);
    
    const server = allConfig.servers.find(server => server.ip === thisPublicIP && server.run === true && server.valid === true);
    
    console.log('server id ---- ', server.id);
    console.log('server proxy ---- ', server.proxy);
    useProxy = server.proxy;

    const thisServerId = server.id;

    const membersArr = allConfig.members.filter(member => member.server.find(item => item === thisServerId));
    // console.log('membersArr ---- ', membersArr);

    const filteredMembers = membersArr.filter(member => member.run === true);
    
    return filteredMembers;

  } catch (error) {
    console.error('데이타베이스에서 퍼블릭 IP로 유저 조회중 오류가 발생했습니다:', error);
  }
}

function setProxy(){

  const proxyConfig = allConfig.proxy;
  console.log('proxyConfig ---- ', proxyConfig);

  httpsAgent = useProxy ? new HttpsProxyAgent(
    `${proxyConfig.protocol}://${proxyConfig.auth.username}:${proxyConfig.auth.password}@${proxyConfig.host}:${proxyConfig.port}`
  ) : null;
}

// 에러 로깅 함수 추가
function logError(phase, error) {
  const errorLog = {
    timestamp: new Date().toISOString(),
    phase: phase,
    error: {
      message: error.message,
      stack: error.stack,
      ...(error.response && { 
        status: error.response.status,
        data: error.response.data 
      })
    }
  };

  const errorLogPath = path.join(__dirname, 'error.json');
  try {
    let existingLogs = [];
    if (fs.existsSync(errorLogPath)) {
      existingLogs = JSON.parse(fs.readFileSync(errorLogPath, 'utf8'));
    }
    existingLogs.push(errorLog);
    fs.writeFileSync(errorLogPath, JSON.stringify(existingLogs, null, 2));
    console.log(`에러 로그가 저장되었습니다: ${errorLogPath}`);
  } catch (err) {
    console.error('에러 로그 저장 실패:', err);
  }
}



// user_info.txt 파일 읽기 및 파싱 함수
// function getUserInfo() {
//   const userInfoPath = path.join(__dirname, 'user_info.txt');
  
//   try {
//     const content = fs.readFileSync(userInfoPath, 'utf8');
    
//     const info = {};
//     content.split('\n').forEach(line => {
//       const [key, value] = line.split('=').map(item => item.trim());
//       if (key && value) {
//         info[key] = value.replace(/['"]/g, '');
//       }
//     });
    
//     return info;
//   } catch (error) {
//     console.error(`설정 파일을 읽을 수 없습니다: ${userInfoPath}`);
//     console.error(error);
//     process.exit(1);
//   }
// }

// 사용자 정보 가져오기
// const userInfo = getUserInfo();

// const dbConfig = {
//   host: userInfo.db_host,
//   user: userInfo.db_user,
//   password: userInfo.db_password,
//   database: userInfo.coupang_database
// };

// console.log('데이터베이스 연결 정보:', dbConfig);

// 제미나이 제목을 만드는 프롬프트
async function generateCreativeTitle(productName) {
  const prompt = `다음 상품에 대한 블로그 포스트의 제목을 하나만 만들어주세요: "${productName}". 
  제목은 클릭을 유도하는 재미있고 독특한 내용이어야 하며, 반드시 상품명의 핵심 키워드를 포함해야 합니다. 
  제목은 한국어로 작성해주세요. 감탄사나 이모지, 특수문자는 사용하지 말아주세요. 제목은 50자 이내로 작성해주세요.
  독특하고 개성있는 상품소개방식을 사용해주세요.
  중요: 반드시 하나의 제목만 제공해야 합니다.`;

  // const chatSession = modelTitle.startChat({
  //   generationConfig,
  //   history: [],
  // });

  try {
    let result = await rotateGeminiKeys(prompt);
    result = removeSpecialCharacters(result.trim());

    // 여러 문단이 반환된 경우 첫 번째 문단만 사용
    if (result.includes('\n\n')) {
      result = result.split('\n\n')[0];
    }

    // 줄바꿈을 공백으로 대체
    result = result.replace(/\n/g, ' ');

    // 연속된 공백을 하나의 공백으로 대체
    result = result.replace(/\s+/g, ' ');

    // 문장 부호는 유지하되 다른 특수 문자 제거
    result = result.replace(/[^\w\s가-힣.,!?]/g, '');

    // 길이 제한 (200자)
    result = result.slice(0, 200);

    // 맨 앞의 숫자와 점(있다면) 제거
    result = result.replace(/^\d+\.\s*/, '');

    return result;
  } catch (error) {
    console.error("첫 인사말 생성 중 오류 발생:", error);
    throw error;
  }
}

// 제미나이 본문을 만드는 프롬프트
const geminiPrompt = `{PRODUCT_NAME}에 대한 제품 설명을 한국어로 작성해주세요. 최소 800자 이상으로 작성해야 합니다. 전체 설명을 커뮤니티 포럼 중독자의 독특한 말투와 언어 스타일을 사용하여 작성하는 것이 매우 중요합니다. 이 말투는 전체 글에서 강하게 강조되어야 합니다. 또한, 반드시 컬러로 된 별표를 사용하여 제품에 대한 별점을 포함해주세요. 각 문단에 이모지는 0개 또는 1개 사용해 주세요.`;

   // 본문 첫 인사 멘트 (상품명 + 멘트 조합)
   async function generateGreeting(productName) {
    const prompt = `"${productName}"에 대한 블로그 포스트의 첫 인사말을 작성해주세요. 
    인사말은 독자의 관심을 끌 수 있도록 흥미롭고 친근하게 작성해주세요. 
    제품의 특징이나 리뷰의 성격을 간단히 언급하면 좋습니다. 
    100자 이내로 작성해주세요. 이모지는 사용하지 말아주세요.`;
  
    // const chatSession = modelTitle.startChat({
    //   generationConfig,
    //   history: [],
    // });
  
    try {
      let result = await rotateGeminiKeys(prompt);
      result = removeSpecialCharacters(result.trim());
  
      // 여러 줄의 제목이 반환된 경우 처리
      if (result.includes('\n')) {
        const titles = result.split('\n').filter(title => title.trim() !== '');
        result = titles[Math.floor(Math.random() * titles.length)];
      }
  
      // 숫자로 시작하는 경우 숫자 제거
      result = result.replace(/^\d+\.\s*/, '');
  
      // 특수 문자 제거 및 길이 제한
      return result.replace(/[^\w\s가-힣]/g, '');
    } catch (error) {
      console.error("제목 생성 중 오류 발생:", error);
      throw error;
    }
  }

    // 제미나이 두번째 본문을 만드는 프롬프트 (상품후기)
    async function generateProductReviews(productName, retryCount = 0) {
      // const chatSession = modelTitle.startChat({
      //   generationConfig,
      //   history: [],
      // });

  const random = Math.floor(Math.random() * (5 - 2 + 1)) + 2;    
  const prompt = `"${productName}"에 대한 ${random}개의 다양한 사용자 후기를 생성해주세요. 각 후기는 실제 사용자가 작성한 것처럼 자연스럽고 개성 있게 작성해주세요. 반드시 긍정적인 후기만 만들어주세요. 각 후기는 한 문단으로 작성하고, 반드시 후기들 사이에는 빈 줄을 넣어주세요. 후기의 시작은 임의의 아이디 형식으로 시작해주세요. 후기의 길이는 50자에서 200자 사이로 작성해주세요. 반드시 생성된 후기만 제공하고 따로 설명 같은것은 제공하면 안됩니다. 이모지는 사용하지 말아주세요.`;

  try {
    let result = await rotateGeminiKeys(prompt);
    result = removeSpecialCharacters(result.trim());

    // 빈 값이 반환된 경우 처리
    if (!result || result.trim() === '') {
      throw new Error('빈 값이 반환되었습니다.');
    }
    
    // 각 후기를 배열로 분리
    const reviews = result.split('\n\n').map(review => review.trim());

    return reviews;
  } catch (error) {
    console.error(`상품 후기 생성 중 오류 발생 (시도 ${retryCount + 1}):`, error);

    if (retryCount < 2) {  // 최대 2번까지 재시도
      console.log("10초 후 다시 시도합니다...");
      await new Promise(resolve => setTimeout(resolve, 10000));  // 10초 대기
      return generateProductReviews(productName, retryCount + 1);
    } else {
      throw new Error("상품 후기 생성 최대 재시도 횟수 초과");
    }
  }
}


const SCRIPT_DIR = __dirname;
// const SESSION_FILE = path.join(__dirname, `${USER_ID}_session.json`);
const COUPANG_CROLL_SCRIPT = path.join(SCRIPT_DIR, 'coupang_croll.php');
const RESULT_FILE = path.join(SCRIPT_DIR, 'result.json');
const ANNE_IMAGE = path.join(SCRIPT_DIR, 'anne.jpg');
const REVIEW_FILE = path.join(SCRIPT_DIR, 'review.txt');
const BASE_URL = 'https://blog.naver.com';
const BLOG_FILES_URL = 'https://blogfiles.pstatic.net';

// 로그인 함수
async function naver_login(accountList) {
  const fs = require('fs');
  const puppeteer = require("puppeteer");
  const path = require('path');
  // 상수 정의
  const HEADLESS_MODE = 'new';
  const WRITE_URL = 'https://nid.naver.com/nidlogin.login?mode=form&url=https://www.naver.com/';
  const loginDelayTime = 2000;
  // 브라우저 시작 옵션 설정
  async function startBrowser() {
      return await puppeteer.launch({
          headless: HEADLESS_MODE,
          ignoreHTTPSErrors: true,
          args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-infobars",
              "--disable-blink-features=AutomationControlled",
              "--ignore-certificate-errors",
          ],
      });
  }
  // 팝업 듣기
  async function autoPopup(page) {
      page.on("dialog", async (dialog) => {
          await dialog.accept();
      });
  }
  // 자동화 우회 설정
  async function makeBrowserNice(page) {
      await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, "webdriver", {
              get: () => false,
          });
      });
      await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
      );
  }
  // 사이트 이동
  async function goToSite(page, url) {
      try {
          await page.goto(url, { waitUntil: "networkidle0" });
      } catch (error) {
          console.error("Failed to load the page:", error);
      }
  }
  // 로그인 함수
  async function loginNaver(page, userId, userPassword) {
      await goToSite(page, WRITE_URL);
      await page.waitForSelector("#id");
      await typeRandomly(page, "#id", userId);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await page.waitForSelector("#pw");
      await typeRandomly(page, "#pw", userPassword);
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // IP 체크 해제
      await page.waitForSelector('#switch');
      await page.click('#switch');

      // 로그인 상태 유지 체크
      await page.waitForSelector('#keep');
      await page.click('#keep');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await page.keyboard.press("Enter");
      await new Promise((resolve) => setTimeout(resolve, loginDelayTime));
      await saveSession(page, userId);
      await page.screenshot({ path: 'login.jpg', fullPage: true });
      console.log('로그인 완료 스크린샷이 저장되었습니다: login.jpg');
  }
  // 세션 정보 저장 함수
  async function saveSession(page, userId) {
      const sessionFilePath = path.join(__dirname, `${userId}_session.json`);
      const cookies = await page.cookies();
      const sessionData = {
          userId,
          cookies,
      };
      await fs.promises.writeFile(sessionFilePath, JSON.stringify(sessionData, null, 2), 'utf8');
      console.log('세션 정보가 저장되었습니다:', sessionFilePath);
  }
  // 랜덤 딜레이 설정
  async function typeRandomly(page, selector, text) {
      await page.click(selector);
      for (let char of text) {
          await page.type(selector, char, { delay: Math.random() * 120 + 30 });
      }
  }
  // 메인 로직
  for (const account of accountList) {
      const { id: userId, password: userPassword } = account;
      console.log(`${userId} 계정으로 로그인을 시작합니다.`);
      const browser = await startBrowser();
      const pages = await browser.pages();
      const page = pages[0];
      await autoPopup(page);
      await makeBrowserNice(page);
      await loginNaver(page, userId, userPassword);
      await browser.close();
      console.log(`${userId} 계정의 세션 정보가 저장되었습니다.`);
      console.log('3초 후 다음 계정으로 로그인을 시작합니다...');
      await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  console.log('모든 계정의 세션 정보가 저장되었습니다.');
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: SCRIPT_DIR }, (error, stdout, stderr) => {
      if (error) {
        console.error(`${command} 실행 중 오류 발생: ${error}`);
        console.error(`stderr: ${stderr}`);
        reject(error);
      } else {
        console.log(`${command} 실행 성공`);
        console.log(`stdout: ${stdout}`);
        resolve(stdout);
      }
    });
  });
}

function removeSpecialCharacters(text) {
  // 이모지 제거
  text = text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '');
  
  // 하나 이상의 연속된 '*', '#' 제거
  text = text.replace(/[*#]+/g, '');
  
  return text;
}

async function checkAndRunLoginScript() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.log("세션 파일을 찾을 수 없습니다. 로그인 스크립트를 실행합니다...");
    await performLogin();
  } else {
    try {
      const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      if (!sessionData || !sessionData.cookies || sessionData.cookies.length === 0) {
        console.log("유효하지 않은 세션 데이터입니다. 로그인 스크립트를 실행합니다...");
        await performLogin();
      }
    } catch (error) {
      console.error("세션 파일을 읽는 중 오류 발생:", error);
      console.log("로그인 스크립트를 실행합니다...");
      await performLogin();
    }
  }
}

async function performLogin() {
  try {
    const accountList = [{ id: USER_ID, password: USER_PASSWORD }]; // 실제 비밀번호로 변경해주세요
    await naver_login(accountList);
    console.log("로그인 성공");
  } catch (error) {
    console.error("로그인 중 오류 발생:", error);
    throw error;
  }
}
async function getCoachData() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    
    // 랜덤하게 하나의 음식점 데이터를 가져옴
    const [rows] = await connection.execute(
      
      `SELECT 
       *
      FROM raw_coach 
      ORDER BY RAND() LIMIT 1` 
    );

    await connection.end();

    if (rows.length > 0) {
      const coachInfo = rows[0];
      console.log('coachInfo ---> ', coachInfo);
      
      const imgAllUrlArr = coachInfo.imgAllUrl.split(',').filter(img => img.trim() !== '');
      console.log('imgAllUrlArr ---> ', imgAllUrlArr);

      fs.writeFileSync('coach.json', JSON.stringify(coachInfo, null, 2));
      
      console.log('이미지 다운로드 디렉토리 체크');
      // 이미지 다운로드
      if (imgAllUrlArr.length > 0) {
        const imgDir = path.join(__dirname, 'coach_imgs');
        if (!fs.existsSync(imgDir)) {
          fs.mkdirSync(imgDir);
        } else {
          // 기존 이미지 파일들 삭제
          fs.readdirSync(imgDir).forEach(file => {
            fs.unlinkSync(path.join(imgDir, file));
          });
        }

        console.log('이미지 다운로드 시작');
        TOTAL_IMG_COUNT = imgAllUrlArr.length;

        for (let i = 0; i < imgAllUrlArr.length; i++) {
          console.log('imgAllUrlArr[i] ----> ', imgAllUrlArr[i]);

          const response = await axios.get(imgAllUrlArr[i], { responseType: 'arraybuffer' });
          const buffer = Buffer.from(response.data, 'binary');
          
          // 각 이미지마다 랜덤으로 프레임 스타일 선택
          const selectedFrameStyle = getRandomFrameStyle();
          const framedBuffer = await selectedFrameStyle(buffer);
          
          const filename = path.join(imgDir, `코치-${coachInfo.nameEng}-${coachInfo.productID.replaceAll("/", "")}-${i + 1}.jpg`);
          console.log('filename ----> ', filename);

          await sharp(framedBuffer).toFile(filename);

          // const response = await axios({
          //   method: 'GET',
          //   url: imgAllUrlArr[i],
          //   responseType: 'stream'
          // });

          // const writer = fs.createWriteStream(path.join(imgDir, `코치-${coachInfo.nameEng}-${coachInfo.productID.replaceAll("/", "")}-${i + 1}.jpg`));
          // response.data.pipe(writer);

          // await new Promise((resolve, reject) => {
          //   writer.on('finish', resolve);
          //   writer.on('error', reject);
          // });
        }
      }

      return coachInfo;
    }
    
    throw new Error('데이터를 찾을 수 없습니다.');
  } catch (error) {
    console.error('데이터베이스 조회 중 오류 발생:', error);
    throw error;
  }
}

// 크롤링 불러오는 함수
async function getCoupangData() {
  let connection = null;
  try {

    console.log('dbConfig ----> ', dbConfig);
    connection = await mysql.createConnection(dbConfig);
    
    const [rows] = await connection.execute(
      
      `SELECT 
       *
      FROM hidden_products 
      ORDER BY RAND() LIMIT 1` 
    );

    // await connection.end();

    if (rows.length > 0) {
      const productInfo = rows[0];
      // console.log('productInfo ---> ', productInfo);
      
      // const mainImg = productInfo.main_image;
      // const thumbNailImgArr = [];
      
      // for (let index = 1; index <= 10; index++) {
      //   productInfo[`thumbnail_${index}`] && thumbNailImgArr.push(productInfo[`thumbnail_${index}`]);
      // }
      
      // const imgAllUrlArr = [];
      // imgAllUrlArr.push(mainImg);
      // imgAllUrlArr.push(...thumbNailImgArr);
      // console.log('imgAllUrlArr ---> ', imgAllUrlArr);

      // TOTAL_IMG_COUNT = imgAllUrlArr.length;

      // fs.writeFileSync('product.json', JSON.stringify(productInfo, null, 2));
      
      // console.log('이미지 다운로드 디렉토리 체크');
      // // 이미지 다운로드
      // if (imgAllUrlArr.length > 0) {
      //   const imgDir = path.join(__dirname, 'product_imgs');
      //   if (!fs.existsSync(imgDir)) {
      //     fs.mkdirSync(imgDir);
      //   } else {
      //     // 기존 이미지 파일들 삭제
      //     fs.readdirSync(imgDir).forEach(file => {
      //       fs.unlinkSync(path.join(imgDir, file));
      //     });
      //   }

      //   console.log('이미지 다운로드 시작');
      //   for (let i = 0; i < imgAllUrlArr.length; i++) {
      //     console.log('imgAllUrlArr[i] ----> ', imgAllUrlArr[i]);
          
      //     const response = await axios.get(imgAllUrlArr[i], { responseType: 'arraybuffer' });
      //     const buffer = Buffer.from(response.data, 'binary');
          
      //     // 각 이미지마다 랜덤으로 프레임 스타일 선택
      //     const selectedFrameStyle = getRandomFrameStyle();
      //     const framedBuffer = await selectedFrameStyle(buffer);
          
      //     const filename = path.join(imgDir, `${productInfo.name.replace(/[^\w\sㄱ-ㅎ가-힣]/g, '').replace(/\s+/g, '_')}-${i + 1}.jpg`);
      //     console.log('filename ----> ', filename);

      //     await sharp(framedBuffer).toFile(filename);

      //   }
      // }
      const [relatedProducts] = await connection.execute(
        `
        SELECT 
         *
        FROM hidden_products 
        WHERE category = ? AND id != ?
        ORDER BY review_count DESC LIMIT 4
        `,
        [productInfo.category, productInfo.id] 
      );
  
      await connection.end();
      
      relatedProducts.length > 0 ? productInfo.relatedProducts = relatedProducts : productInfo.relatedProducts = [];

      return productInfo;
    }
    
    throw new Error('데이터를 찾을 수 없습니다.');
  } catch (error) {
    console.error('데이터베이스 조회 중 오류 발생:', error);
    throw error;
  }finally{
    connection && await connection.end();
  }
  // await checkAndRunLoginScript();
  // console.log("크롤링 시작");
  // await runCommand(`php ${COUPANG_CROLL_SCRIPT}`);
}



//user agent 세팅 (여러개 두면 랜덤으로 선택되나 유효성을 확인하고 추가해야합니ㄷ)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// 제미나이 API 호출
const {
  GoogleGenerativeAI,
} = require("@google/generative-ai");

// const genAITitle = new GoogleGenerativeAI(GEMINI_API_KEY_TITLE);
// const genAIContent = new GoogleGenerativeAI(GEMINI_API_KEY_CONTENT);



const rotateGeminiKeys = async (prompt) => {
  // return 'test...';
  // console.log("geminiKeys :", geminiKeys);
    
  let review = null;
  for (let i = 0; i < geminiKeys.length; i++) { //geminiKeys 글로벌 변수
    // console.log("key looping 시작");
    const key = geminiKeys.shift();
    const genAI = new GoogleGenerativeAI(key.apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
    });

    try{
      
      console.log('Gemini에게 요청 중...');
      const chatSession = model.startChat({
        generationConfig,
        history: [],
      });
  
      const result = await chatSession.sendMessage(prompt);
      review = result.response.text();        
      
    } catch (error) {
      console.error(`❌ Failed to generate review with key ${key}:`, error);
    }      
    
    if (review) {
      console.log(`✅ Success: ${JSON.stringify(key)}`);
      geminiKeys.unshift(key); // 성공한 key를 배열 맨 앞에 삽입
      break; // 루프 종료
    } else {
      console.log(`❌ Failed: ${JSON.stringify(key)}, moving to end`);
      geminiKeys.push(key); // 실패한 key는 맨 뒤로
    }
    console.log("geminiKeys 실패후 10초 대기")
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  return review;
}

// const modelTitle = genAITitle.getGenerativeModel({ model: "gemini-2.0-flash" });
// const modelContent = genAIContent.getGenerativeModel({ model: "gemini-2.0-flash" });

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendMessageWithRetry(chatSession, message, maxRetries = 5, retryDelay = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
          const result = await chatSession.sendMessage(message);
          return result.response.text();
      } catch (error) {
          if (attempt === maxRetries) {
              throw error; // 최대 재시도 횟수에 도달하면 에러를 던집니다.
          }
          console.log(`시도 ${attempt}/${maxRetries} 실패. ${retryDelay/1000}초 후 재시도...`);
          await delay(retryDelay);
      }
  }
}

async function geminiReview(productName) {
  // const chatSession = modelContent.startChat({
  //   generationConfig,
  //   history: [],
  // });

  try {
    const actualPrompt = geminiPrompt.replace("{PRODUCT_NAME}", productName);
    let generatedText = await rotateGeminiKeys(actualPrompt);

    // 특수 문자 제거
    generatedText = removeSpecialCharacters(generatedText);

    console.log("Gemini API가 생성한 본문 내용 (특수 문자 제거):");
    console.log(generatedText);

    const filePath = path.join(__dirname, 'review.txt');
    await fs.promises.writeFile(filePath, generatedText, 'utf8');
    
    console.log("Gemini api 호출 성공 (본문 내용)");
    return generatedText;
  } catch (error) {
    console.error("본문 내용 생성 중 오류 발생:", error);
    throw error;
  }
}

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, headers: { 'User-Agent': getRandomUserAgent() } }));

function parseXML(xml) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(xml, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// 발행 전 토큰 받아오기 
async function getToken() {
  const config = {
      method: 'get',
      url: `${BASE_URL}/PostWriteFormSeOptions.naver?blogId=${BLOG_ID}&categoryNo=${CATEGORY_ID}`,
      headers: {
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'referer': `${BASE_URL}/${BLOG_ID}/postwrite?categoryNo=${CATEGORY_ID}`,
          'user-agent': getRandomUserAgent(),
      },
  };

  console.log('config ---> ', config);
  const response = await client(config);
  // console.log('response.data ---> ', response.data);
  if (!response.data.result) {
      throw new Error('Failed to retrieve token: result is undefined');
  }

  // // // 응답에서 새로운 쿠키 추출 및 저장
  // // const newCookies = response.headers['set-cookie'];
  // // if (newCookies) {
  // //   const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  // //   newCookies.forEach(cookieString => {
  // //     const cookieParts = cookieString.split(';')[0].split('=');
  // //     const cookieName = cookieParts[0].trim();
  // //     const cookieValue = cookieParts[1];
      
  // //     // 기존 쿠키 업데이트 또는 새 쿠키 추가
  // //     const existingCookieIndex = sessionData.cookies.findIndex(c => c.name === cookieName);
  // //     if (existingCookieIndex !== -1) {
  // //       sessionData.cookies[existingCookieIndex].value = cookieValue;
  // //     } else {
  // //       sessionData.cookies.push({
  // //         name: cookieName,
  // //         value: cookieValue,
  // //         domain: '.naver.com',
  // //         path: '/',
  // //       });
  // //     }
  // //   });

  // //   // 업데이트된 세션 데이터 저장
  // //   fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));

  // //   // CookieJar 업데이트
  // //   newCookies.forEach(cookie => {
  // //     jar.setCookieSync(cookie, BASE_URL);
  // //   });
  // }

  return response.data.result.token;
}
// 이미지 세션
async function getSessionKey(token) {
  const config = {
      method: 'get',
      url: 'https://platform.editor.naver.com/api/blogpc001/v1/photo-uploader/session-key',
      headers: {
          'accept': 'application/json',
          'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'origin': BASE_URL,
          'referer': `${BASE_URL}/${BLOG_ID}/postwrite?categoryNo=${CATEGORY_ID}`,
          'se-app-id': 'SE-2a665df9-8ca0-4cc0-a2ba-16b36d52889f',
          'se-authorization': token,
          'user-agent': getRandomUserAgent(),
      },
  };

  const response = await client(config);
  return response.data.sessionKey;
}

function getRandomFrameStyle() {
  const styles = [createFramedImage1, createFramedImage2, createFramedImage3];
  // return styles[Math.floor(Math.random() * styles.length)];
  return createFramedImage1;
}

// 이미지 스타일 1 
async function createFramedImage1(inputBuffer) {
  const frameWidth = 6;
  const glowWidth = 8;
  const borderWidth = 2;
  
  const vibrantColors = [
    '#FFFFF0E6',
    '#F5F5F5E6',
    '#FFF8DDE6',
    '#FAFAFAE6',
    '#FFFFFEE6'
  ];
  
  const selectedColor = vibrantColors[Math.floor(Math.random() * vibrantColors.length)];
  
  
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  
  const totalWidth = metadata.width + frameWidth * 2 + glowWidth * 2;
  const totalHeight = metadata.height + frameWidth * 2 + glowWidth * 2;
  
  return await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([
      {
        input: Buffer.from(`
          <svg width="${totalWidth}" height="${totalHeight}">
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="${glowWidth/2}" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <rect x="${glowWidth}" y="${glowWidth}" 
                  width="${totalWidth - glowWidth * 2}" height="${totalHeight - glowWidth * 2}" 
                  fill="none" rx="15" ry="15"/>
            <rect x="${glowWidth + borderWidth}" y="${glowWidth + borderWidth}" 
                  width="${totalWidth - (glowWidth + borderWidth) * 2}" height="${totalHeight - (glowWidth + borderWidth) * 2}" 
                  fill="${selectedColor}" rx="10" ry="10" filter="url(#glow)"/>
          </svg>
        `),
        top: 0,
        left: 0
      },
      {
        input: await image
          .modulate({ brightness: 1.1, saturation: 1.2 })
          .sharpen()
          .toBuffer(),
        top: frameWidth + glowWidth,
        left: frameWidth + glowWidth
      }
    ])
    .jpeg({ quality: 95 })
    .toBuffer();
  }

// 이미지 스타일 2 
async function createFramedImage2(inputBuffer) {
  const outerFrameWidth = 40;
  const innerFrameWidth = 20;
  const cornerSize = 60;
  
  const frameColors = [
    { outer: 'rgba(255, 192, 203, 0.7)', inner: 'rgba(255, 228, 225, 0.9)', accent: 'rgba(255, 160, 122, 1)' },  // 핑크
    { outer: 'rgba(144, 238, 144, 0.7)', inner: 'rgba(224, 255, 255, 0.9)', accent: 'rgba(127, 255, 212, 1)' },  // 그린
    { outer: 'rgba(176, 196, 222, 0.7)', inner: 'rgba(230, 230, 250, 0.9)', accent: 'rgba(123, 104, 238, 1)' },  // 블루
    { outer: 'rgba(255, 228, 196, 0.7)', inner: 'rgba(255, 250, 205, 0.9)', accent: 'rgba(255, 165, 0, 1)' },    // 오렌지
    { outer: 'rgba(221, 160, 221, 0.7)', inner: 'rgba(238, 130, 238, 0.9)', accent: 'rgba(218, 112, 214, 1)' },  // 퍼플
    { outer: 'rgba(175, 238, 238, 0.7)', inner: 'rgba(224, 255, 255, 0.9)', accent: 'rgba(64, 224, 208, 1)' },   // 청록색
    { outer: 'rgba(255, 218, 185, 0.7)', inner: 'rgba(255, 245, 238, 0.9)', accent: 'rgba(255, 127, 80, 1)' },   // 살구색
    { outer: 'rgba(240, 230, 140, 0.7)', inner: 'rgba(255, 255, 224, 0.9)', accent: 'rgba(255, 215, 0, 1)' },    // 노랑
    { outer: 'rgba(176, 224, 230, 0.7)', inner: 'rgba(240, 248, 255, 0.9)', accent: 'rgba(135, 206, 235, 1)' },  // 하늘색
    { outer: 'rgba(216, 191, 216, 0.7)', inner: 'rgba(245, 245, 245, 0.9)', accent: 'rgba(186, 85, 211, 1)' }    // 라벤더
  ];

  const selectedColor = frameColors[Math.floor(Math.random() * frameColors.length)];

  const image = sharp(inputBuffer);
  const metadata = await image.metadata();

  const rotationAngle = (Math.random() < 0.5 ? -1 : 1) * Math.random() * 3;

  const radians = Math.abs(rotationAngle) * Math.PI / 180;
  const rotatedWidth = Math.ceil(
    metadata.width * Math.cos(radians) + metadata.height * Math.sin(radians)
  );
  const rotatedHeight = Math.ceil(
    metadata.width * Math.sin(radians) + metadata.height * Math.cos(radians)
  );

  const totalWidth = rotatedWidth + (outerFrameWidth + innerFrameWidth) * 2;
  const totalHeight = rotatedHeight + (outerFrameWidth + innerFrameWidth) * 2;

  const saturationAdjust = 1.0 + Math.random() * 0.1;

  return await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 4,
      background: selectedColor.outer
    }
  })
    .composite([
      {
        input: {
          create: {
            width: totalWidth - outerFrameWidth * 2,
            height: totalHeight - outerFrameWidth * 2,
            channels: 4,
            background: selectedColor.inner
          }
        },
        top: outerFrameWidth,
        left: outerFrameWidth
      },
      {
        input: Buffer.from(`<svg><rect x="0" y="0" width="${cornerSize}" height="${cornerSize}" fill="none" stroke="${selectedColor.accent}" stroke-width="2"/></svg>`),
        top: 0,
        left: 0
      },
      {
        input: Buffer.from(`<svg><rect x="0" y="0" width="${cornerSize}" height="${cornerSize}" fill="none" stroke="${selectedColor.accent}" stroke-width="2"/></svg>`),
        top: 0,
        left: totalWidth - cornerSize
      },
      {
        input: Buffer.from(`<svg><rect x="0" y="0" width="${cornerSize}" height="${cornerSize}" fill="none" stroke="${selectedColor.accent}" stroke-width="2"/></svg>`),
        top: totalHeight - cornerSize,
        left: 0
      },
      {
        input: Buffer.from(`<svg><rect x="0" y="0" width="${cornerSize}" height="${cornerSize}" fill="none" stroke="${selectedColor.accent}" stroke-width="2"/></svg>`),
        top: totalHeight - cornerSize,
        left: totalWidth - cornerSize
      },
      {
        input: await image
          .rotate(rotationAngle, { background: { r: 255, g: 255, b: 255, alpha: 0 } })
          .modulate({ 
            saturation: saturationAdjust,
            brightness: 1.05
          })
          .sharpen()
          .toBuffer(),
        top: outerFrameWidth + innerFrameWidth,
        left: outerFrameWidth + innerFrameWidth
      }
    ])
    .jpeg({ quality: 95 })
    .toBuffer();
}

// 이미지 스타일 3 
async function createFramedImage3(inputBuffer) {
  const frameWidth = 60;
  const glowWidth = 30;

  const gradientColors = [
    { start: '#FF7E79', end: '#FFD57E' },  // 빨강-노랑 그라데이션
    { start: '#7ED9FF', end: '#7EFFD1' },  // 파랑-초록 그라데이션
    { start: '#D17EFF', end: '#FF7ED9' },  // 보라-핑크 그라데이션
    { start: '#FF7ED9', end: '#7EFFD1' }   // 핑크-초록 그라데이션
  ];

  const selectedGradient = gradientColors[Math.floor(Math.random() * gradientColors.length)];

  const image = sharp(inputBuffer);
  const metadata = await image.metadata();

  const totalWidth = metadata.width + frameWidth * 2 + glowWidth * 2;
  const totalHeight = metadata.height + frameWidth * 2 + glowWidth * 2;

  return await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    }
  })
    .composite([
      {
        input: Buffer.from(`
          <svg width="${totalWidth}" height="${totalHeight}">
            <defs>
              <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:${selectedGradient.start};stop-opacity:1" />
                <stop offset="100%" style="stop-color:${selectedGradient.end};stop-opacity:1" />
              </linearGradient>
            </defs>
            <rect x="${glowWidth}" y="${glowWidth}" width="${totalWidth - glowWidth * 2}" height="${totalHeight - glowWidth * 2}" fill="url(#grad1)" />
          </svg>
        `),
        top: 0,
        left: 0
      },
      {
        input: await image
          .resize({
            width: metadata.width,
            height: metadata.height,
            fit: sharp.fit.cover,
            position: sharp.gravity.center,
            background: { r: 255, g: 255, b: 255, alpha: 0 }
          })
          .toBuffer(),
        top: frameWidth + glowWidth,
        left: frameWidth + glowWidth
      },
      {
        input: Buffer.from(`
          <svg width="${totalWidth}" height="${totalHeight}">
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="10" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" rx="20" ry="20" fill="none" stroke="#FFFFFF" stroke-width="15" filter="url(#glow)"/>
          </svg>
        `),
        top: 0,
        left: 0
      }
    ])
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function downloadAndConvertImage(imageUrl, index) {
  const response = await axios.get(imageUrl.startsWith("//") ? `https:${imageUrl}` : imageUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data, 'binary');
  
  // 각 이미지마다 랜덤으로 프레임 스타일 선택
  const selectedFrameStyle = getRandomFrameStyle();
  const framedBuffer = await selectedFrameStyle(buffer);
  
  const filename = `image_${index}.jpg`;
  await sharp(framedBuffer).toFile(filename);
  
  return filename;
}





async function uploadImage(sessionKey, imagePath) {
  const formData = new FormData();
  formData.append('image', fs.createReadStream(imagePath));

  const config = {
    method: 'post',
    url: `https://blog.upphoto.naver.com/${sessionKey}/simpleUpload/0?userId=${USER_ID}&extractExif=true&extractAnimatedCnt=true&autorotate=true&extractDominantColor=false&type=&customQuery=&denyAnimatedImage=false&skipXcamFiltering=false`,
    headers: {
      ...formData.getHeaders(),
      'Accept': '*/*',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Origin': BASE_URL,
      'Referer': `${BASE_URL}/${BLOG_ID}/postwrite?categoryNo=${CATEGORY_ID}`,
      'User-Agent': getRandomUserAgent(),
    },
    data: formData
  };

  const response = await client(config);
  const parsedXML = await parseXML(response.data);
  const item = parsedXML.item;
  return {
    url: `${BLOG_FILES_URL}${item.url[0]}`,
    path: `${item.path[0]}/${item.fileName[0]}`,
    fileSize: parseInt(item.fileSize[0]),
    width: parseInt(item.width[0]),
    height: parseInt(item.height[0]),
    originalWidth: parseInt(item.width[0]),
    originalHeight: parseInt(item.height[0]),
    fileName: item.fileName[0],
    thumbnail: `${BLOG_FILES_URL}${item.thumbnail[0]}`
  };
}

function getRandomTime(min, max) {
  // 분 단위를 초 단위로 변환
  const minSeconds = min * 60;
  const maxSeconds = max * 60;
  // 최소값과 최대값 사이의 랜덤한 초 값을 반환
  return Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
}

// 랜덤 페이지 체류 시간
function getRandomStayTime() {
  return getRandomTime(55, 110);
}

// 랜덤 타이핑 시간
function getRandomTypingTime() {
  return getRandomTime(40, 50);
}




async function createDocumentModel(firstProduct, uploadedImages, blogId, logNo, creativeTitle, greeting, productReviews, crawledData) {

  const components = [];
  let usedEmoticons = [];
  const selectedKeyword = firstProduct.keyword || '';

  console.log('selectedKeyword ---> ', selectedKeyword);
  // const selectedKeyword = crawledData.keyword || '';

  const longFirstaffiliateUrl = createAffiliateUrl(firstProduct);
  const firstAffiliateUrl = await transformShortLink(longFirstaffiliateUrl);
  
  // 링크 텍스트 목록
  const linkTexts = [
    "🛒 상품 상세 페이지로 이동하기",
    "⚡ 상품 구매 페이지로 바로가기",
    "🔍 상품 자세히 보러가기",
    "💰 할인 상품 정보 확인하기",
    "🎁 상품 혜택 정보 보러가기",
    "🏃‍♂️ 상품 구매 서두르기",
    "📚 상품 리뷰 확인하러 가기",
    "📊 상품 스펙 자세히 보기",
    "✅ 상품 구매 전 체크하기",
    "🕒 상품 재고 확인하러 가기",
    "😊 상품 구매 만족도 보기",
    "💸 상품 가격 비교하러 가기",
    "🚚 상품 배송 정보 확인하기",
    "🆕 신규 구매자 혜택 보러가기",
    "🏆 인기 상품 정보 확인하기",
    "❓ 상품 Q&A 페이지로 이동",
    "🎫 상품 할인 쿠폰 받으러 가기",
    "📖 상품 구매 가이드 읽기",
    "🎥 상품 영상 리뷰 보러가기",
    "🔥 특가 상품 정보 확인하기",
    "🎟️ 상품 프로모션 확인하기",
    "🎉 상품 관련 이벤트 보기",
    "💡 상품 사용 팁 확인하기",
    "🌟 상품 최신 리뷰 보러가기",
    "📅 상품 배송일 확인하기",
    "🎨 상품 색상 옵션 보기",
    "📏 상품 사이즈 가이드 확인",
    "🔧 상품 A/S 정보 알아보기",
    "🏷️ 상품 브랜드 정보 보기",
    "📦 상품 구성 확인하러 가기",
    "🔁 상품 교환/반품 정책 보기",
    "👍 추천 상품 정보 확인하기",
    "🎭 상품 실제 사용 후기 보기",
    "📸 상품 실제 사진 구경하기",
    "🔔 상품 재입고 알림 신청하기",
    "🛍️ 상품 장바구니에 담기",
    "💳 상품 결제 옵션 확인하기",
    "🎀 상품 선물 포장 옵션 보기",
    "🌈 상품 컬러 옵션 둘러보기",
    "📞 상품 관련 문의하러 가기",
    "🔬 상품 상세 정보 확인하기",
    "🌱 상품 친환경 정보 보기",
    "🏋️‍♀️ 상품 무게 정보 확인하기",
    "🔋 상품 배터리 정보 보기",
    "🌡️ 상품 보관 방법 알아보기",
    "🍽️ 상품 세척 방법 확인하기",
    "📏 상품 상세 치수 보러가기",
    "🔠 상품 각인 옵션 확인하기",
    "🎮 상품 호환성 정보 보기",
    "🔧 상품 조립 설명서 확인하기"
];

// 사용된 링크 텍스트를 추적하기 위한 Set
const usedLinkTexts = new Set();

// 랜덤하고 중복되지 않는 링크 텍스트를 선택하는 함수
function getRandomLinkText() {
  const availableTexts = linkTexts.filter(text => !usedLinkTexts.has(text));
  if (availableTexts.length === 0) {
    // 모든 텍스트가 사용되었다면 초기화
    usedLinkTexts.clear();
    return linkTexts[Math.floor(Math.random() * linkTexts.length)];
  }
  const selectedText = availableTexts[Math.floor(Math.random() * availableTexts.length)];
  usedLinkTexts.add(selectedText);
  return selectedText;
}

const addTextLine = (components, textValue) => {
   
  components.push({
    id: uuidv4(),
    layout: "default",
    value: [{
      id: uuidv4(),
      nodes: [{
        id: uuidv4(),
        value: textValue,
        style: {
          fontColor: "#000000",
          fontFamily: "nanumgothic",
          fontSizeCode: "fs16",
          backgroundColor: "#ffffff",
          bold: true,
          "@ctype": "nodeStyle"
        },
        "@ctype": "textNode"
      }],
      style: {
        align: "center",
        lineHeight: 2.4615384615384615,
        "@ctype": "paragraphStyle"
      },
      "@ctype": "paragraph"
    }],
    "@ctype": "text"
  });

}
// 링크 컴포넌트를 생성하는 함수
function createLinkComponent(blogId, logNo, firstProduct) {
  const linkText = getRandomLinkText();
  return {
    id: uuidv4(),
    layout: "default",
    value: [
      {
        id: uuidv4(),
        nodes: [
          {
            id: uuidv4(),
            value: "\n", // 첫 번째 줄바꿈 추가
            "@ctype": "textNode"
          },
          {
            id: uuidv4(),
            value: linkText,
            style: {
              fontSizeCode: "fs26", // 큰 글씨
              bold: true,
              "@ctype": "nodeStyle"
            },
            link: {
              url: UPDATE_LINK == 1 ? `https://m.blog.naver.com/CommentList.naver?blogId=${blogId}&logNo=${logNo}` : firstAffiliateUrl,
              "@ctype": "urlLink"
            },
            "@ctype": "textNode"
          },
          {
            id: uuidv4(),
            value: "\n", // 마지막 줄바꿈 추가
            "@ctype": "textNode"
          }
        ],
        style: {
          align: "center", // 가운데 정렬
          "@ctype": "paragraphStyle"
        },
        "@ctype": "paragraph"
      }
    ],
    "@ctype": "text"
  };
}

  function getUniqueRandomEmoticon() {
    let availableEmoticons = emoticonUrls.filter(emoti => !usedEmoticons.includes(emoti));
    if (availableEmoticons.length === 0) {
      usedEmoticons = [];
      availableEmoticons = emoticonUrls;
    }
    const selectedEmoticon = availableEmoticons[Math.floor(Math.random() * availableEmoticons.length)];
    usedEmoticons.push(selectedEmoticon);
    return {
      id: uuidv4(),
      layout: "default",
      align: "center",
      packCode: selectedEmoticon.packCode,
      seq: selectedEmoticon.seq,
      thumbnail: {
        src: selectedEmoticon.src,
        width: 185,
        height: 160,
        "@ctype": "thumbnail"
      },
      format: selectedEmoticon.src.endsWith(".gif") ? "animated" : "normal",
      "@ctype": "sticker"
    };
  }

  // anne.jpg를 제외한 실제 디테일 이미지들
  const detailImages = uploadedImages.slice(0, -1);

  // anne.jpg (마지막 이미지)
  const anneImage = uploadedImages[uploadedImages.length - 1];

components.push({
  id: uuidv4(),
  layout: "default",
  title: [
    {
      id: uuidv4(),
      nodes: [
        {
          id: uuidv4(),
          value: `[${selectedKeyword}] ${creativeTitle.replace(/\*/g, '')}`,
          "@ctype": "textNode"
        }
      ],
      "@ctype": "paragraph"
    }
  ],
  subTitle: null,
  align: "left",
  "@ctype": "documentTitle"
});

// 파트너스 안내문 추가
components.push({
  id: uuidv4(),
  layout: "default",
  value: [
    {
      id: uuidv4(),
      nodes: [
        {
          id: uuidv4(),
          value: partnerNotice,
          style: {
            fontSizeCode: "fs16",
            "@ctype": "nodeStyle"
          },
          "@ctype": "textNode"
        }
      ],
      style: {
        align: "center",
        "@ctype": "paragraphStyle"
      },
      "@ctype": "paragraph"
    }
  ],
  "@ctype": "text"
});

    // 상품명과 생성된 인사말을 인용구 스타일로 추가
    components.push({
      id: uuidv4(),
      layout: "quotation_underline",
      value: [
        {
          id: uuidv4(),
          nodes: [
            {
              id: uuidv4(),
              value: firstProduct['name'],
              style: {
                fontSizeCode: "fs26",
                bold: true,
                "@ctype": "nodeStyle"
              },
              "@ctype": "textNode"
            }
          ],
          "@ctype": "paragraph"
        },
        // {
        //   id: uuidv4(),
        //   nodes: [
        //     {
        //       id: uuidv4(),
        //       value: greeting,
        //       style: {
        //         fontSizeCode: "fs24",
        //         bold: true,
        //         "@ctype": "nodeStyle"
        //       },
        //       "@ctype": "textNode"
        //     }
        //   ],
        //   "@ctype": "paragraph"
        // }
      ],
      source: null,
      "@ctype": "quotation"
    });

    components.push({
      id: uuidv4(),
      layout: "quotation_underline",
      value: [
        {
          id: uuidv4(),
          nodes: [
            {
              id: uuidv4(),
              value: greeting,
              style: {
                fontSizeCode: "fs24",
                bold: true,
                "@ctype": "nodeStyle"
              },
              "@ctype": "textNode"
            }
          ],
          "@ctype": "paragraph"
        }
      ],
      source: null,
      "@ctype": "quotation"
    });

  // 첫번째 이모티콘
  components.push(getUniqueRandomEmoticon());

  // 첫번째 사진
  if (detailImages.length > 0) {
    components.push(createImageComponent(detailImages[0]));
  } else {
    components.push(getUniqueRandomEmoticon());
  }

  // 리뷰.txt 내용
  let reviewText = '';
try {
  reviewText = fs.readFileSync(REVIEW_FILE, 'utf8');
  reviewText = removeSpecialCharacters(reviewText);
} catch (error) {
  console.error('review.txt 파일을 읽는 데 실패했습니다:', error);
}
if (reviewText) {
  components.push({
    id: uuidv4(),
    layout: "default",
    value: [
      {
        id: uuidv4(),
        nodes: [
          {
            id: uuidv4(),
            value: reviewText,
            "@ctype": "textNode"
          }
        ],
        style: {
          align: "center",
          "@ctype": "paragraphStyle"
        },
        "@ctype": "paragraph"
      }
    ],
    "@ctype": "text"
  });
}

// 링크가 필요한 모든 곳에서 이 함수를 호출하면 됩니다.
components.push(createLinkComponent(BLOG_ID, logNo, firstProduct));

// 두번째 사진
if (detailImages.length > 1) {
  components.push(createImageComponent(detailImages[1]));
} else {
  components.push(getUniqueRandomEmoticon());
}

// 평점, 평점수, 적립금
const ratingInfo = [];
if (firstProduct['review_count']) {
  ratingInfo.push({
    id: uuidv4(),
    nodes: [
      {
        id: uuidv4(),
        value: `리뷰수: ${firstProduct['review_count']}`,
        "@ctype": "textNode"
      }
    ],
    "@ctype": "paragraph"
  });
}
if (firstProduct['discount_rate']) {
  ratingInfo.push({
    id: uuidv4(),
    nodes: [
      {
        id: uuidv4(),
        value: `할인율: ${firstProduct['discount_rate']}`,
        "@ctype": "textNode"
      }
    ],
    "@ctype": "paragraph"
  });
}
if (firstProduct['reward_info']) {
  ratingInfo.push({
    id: uuidv4(),
    nodes: [
      {
        id: uuidv4(),
        value: `적립금: ${firstProduct['reward_info']} 원`,
        "@ctype": "textNode"
      }
    ],
    "@ctype": "paragraph"
  });
}
if (ratingInfo.length > 0) {
  components.push({
    id: uuidv4(),
    layout: "quotation_corner",
    value: ratingInfo,
    source: null,
    align: "center",
    "@ctype": "quotation"
  });
}

// 세번째 사진
if (detailImages.length > 2) {
  components.push(createImageComponent(detailImages[2]));
} else {
  components.push(getUniqueRandomEmoticon());
}

// 링크가 필요한 모든 곳에서 이 함수를 호출하면 됩니다.
components.push(createLinkComponent(BLOG_ID, logNo, firstProduct));

// 네번째 사진
if (detailImages.length > 3) {
  components.push(createImageComponent(detailImages[3]));
} else {
  components.push(getUniqueRandomEmoticon());
}


// 상품 후기 추가
if (productReviews && productReviews.length > 0) {
  addTextLine(components, '')
  addTextLine(components, '✅ 다른분들의 리뷰도 살펴볼께요 ✅')
  components.push({
    id: uuidv4(),
    layout: "default",
    value: [
      {
        id: uuidv4(),
        nodes: [
          {
            id: uuidv4(),
            value: "",
            style: {
              fontSizeCode: "fs26",
              bold: true,
              "@ctype": "nodeStyle"
            },
            "@ctype": "textNode"
          }
        ],
        style: {
          align: "center",
          "@ctype": "paragraphStyle"
        },
        "@ctype": "paragraph"
      },
      ...productReviews.map(review => ({
        id: uuidv4(),
        nodes: [
          {
            id: uuidv4(),
            value: "\n", // 줄바꿈 추가
            "@ctype": "textNode"
          },
          {
            id: uuidv4(),
            value: '📌'+review,
            "@ctype": "textNode"
          },
          {
            id: uuidv4(),
            value: "\n", // 줄바꿈 추가
            "@ctype": "textNode"
          }
        ],
        "@ctype": "paragraph"
      }))
    ],
    "@ctype": "text"
  });
}

addTextLine(components, '');

// 링크가 필요한 모든 곳에서 이 함수를 호출하면 됩니다.
components.push(createLinkComponent(BLOG_ID, logNo, firstProduct));

// 남은 사진들을 슬라이드로 추가
if (detailImages.length > 4) {
  const collageImages = detailImages.slice(4).map((imageInfo, index) => 
    createImageComponent(imageInfo)
  );

  components.push({
    id: uuidv4(),
    layout: "slide",
    contentMode: "extend",
    caption: null,
    images: collageImages,
    "@ctype": "imageGroup"
  });
}

addTextLine(components, '');
addTextLine(components, '');
// anne.jpg
const message = `이 포스팅에 상표권이나 저작권을\n 침해하는 내용이 있다면, 이메일로 연락 주시기 바랍니다.🙏📧 \n ${MY_EMAIL}`;
addTextLine(components, message);
addTextLine(components, '');

const stayTime = getRandomStayTime();
const typingTime = getRandomTypingTime();

return {
  documentId: "",
  document: {
    version: "2.8.0",
    theme: "default",
    language: "ko-KR",
    id: uuidv4(),
    components: components,
    di: {
      dif: false,
      dio: [
        {
          dis: "N",
          dia: {
            t: 0,
            p: 0,
            st: stayTime,
            sk: typingTime
          }
        },
        {
          dis: "N",
          dia: {
            t: 0,
            p: 0,
            st: stayTime,
            sk: typingTime
          }
        }
      ]
    }
  }
};
}

function createImageComponent(image) {
  const maxWidth = 600; // 원하는 최대 너비
  let width = image.width;
  let height = image.height;

  if (width > maxWidth) {
    const ratio = maxWidth / width;
    width = maxWidth;
    height = Math.round(height * ratio);
  }

  return {
    id: uuidv4(),
    layout: "default",
    src: image.url,
    internalResource: true,
    represent: false,
    path: image.path,
    domain: BLOG_FILES_URL,
    fileSize: image.fileSize,
    width: width,
    height: height,
    originalWidth: image.width,
    originalHeight: image.height,
    fileName: image.fileName,
    caption: null,
    format: "normal",
    displayFormat: "normal",
    imageLoaded: true,
    contentMode: "normal",
    widthPercentage: 0,
    origin: {
      srcFrom: "local",
      "@ctype": "imageOrigin"
    },
    "@ctype": "image",
    align: "center"
  };
}

function createPopulationParams(uploadedImages, autoSaveNo = null, logNo = null) {
  return {
    configuration: {
      openType: OPEN_TYPE,
      commentYn: true,
      searchYn: true,
      sympathyYn: true,
      scrapType: 2,
      outSideAllowYn: true,
      twitterPostingYn: false,
      facebookPostingYn: false,
      cclYn: false
    },
    populationMeta: {
      categoryId: CATEGORY_ID,
      logNo: logNo,
      directorySeq: 0,
      directoryDetail: null,
      mrBlogTalkCode: null,
      postWriteTimeType: "now",
      tags: "",
      moviePanelParticipation: false,
      greenReviewBannerYn: false,
      continueSaved: false,
      noticePostYn: false,
      autoByCategoryYn: false,
      postLocationSupportYn: false,
      postLocationJson: null,
      prePostDate: null,
      thisDayPostInfo: null,
      scrapYn: false,
      autoSaveNo: autoSaveNo,
      imageList: uploadedImages.map(image => ({
        path: image.path,
        url: image.url,
        fileSize: image.fileSize,
        width: image.width,
        height: image.height,
        fileName: image.fileName,
        internalResource: true
      }))
    },
    editorSource: "2SFRssMItF6lyIh/LQVcjQ=="
  };
}

async function autoSave(documentModel, populationParams) {
  const config = {
      method: 'post',
      url: `${BASE_URL}/RabbitAutoSaveWrite.naver`,
      headers: {
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'content-type': 'application/x-www-form-urlencoded',
          'origin': BASE_URL,
          'referer': `${BASE_URL}/${BLOG_ID}/postwrite?categoryNo=${CATEGORY_ID}`,
          'user-agent': getRandomUserAgent(),
      },
      data: `blogId=${BLOG_ID}&documentModel=${encodeURIComponent(JSON.stringify(documentModel))}&populationParams=${encodeURIComponent(JSON.stringify(populationParams))}&productApiVersion=v1`,
  };

  const response = await client(config);
  return response.data;
}

async function publishPost(autoSaveNo, documentModel, populationParams) {
  const requestData = `blogId=${BLOG_ID}&documentModel=${encodeURIComponent(JSON.stringify(documentModel))}&populationParams=${encodeURIComponent(JSON.stringify(populationParams))}&productApiVersion=v1`;

  // console.log("글쓰기 페이로드:");
  // console.log(requestData);

  const config = {
      method: 'post',
      url: `${BASE_URL}/RabbitWrite.naver`,
      headers: {
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'content-type': 'application/x-www-form-urlencoded',
          'origin': BASE_URL,
          'referer': `${BASE_URL}/${BLOG_ID}/postwrite?categoryNo=${CATEGORY_ID}`,
          'user-agent': getRandomUserAgent(),
      },
      data: requestData,
  };

  const response = await client(config);
  if (response.data.isSuccess && response.data.result && response.data.result.redirectUrl) {
      // console.log("포스트 발행 결과 : " + response.data.result.redirectUrl);

      // 게시글 아이디 추출 및 로그 출력
      const postId = new URL(response.data.result.redirectUrl).searchParams.get('logNo');
      // console.log("게시글 아이디: " + postId);
  } else {
      console.error("포스트 발행 실패");
      console.error(response.data);
  }

  return response.data;
}

// 이모티콘 리스트
const emoticonUrls = [
  { packCode: "cafe_001", seq: 11, src: "https://storep-phinf.pstatic.net/cafe_001/original_11.gif" },
  { packCode: "cafe_001", seq: 4, src: "https://storep-phinf.pstatic.net/cafe_001/original_4.gif" },
  { packCode: "cafe_001", seq: 23, src: "https://storep-phinf.pstatic.net/cafe_001/original_23.gif" },
  { packCode: "cafe_001", seq: 19, src: "https://storep-phinf.pstatic.net/cafe_001/original_19.gif" },
  { packCode: "cafe_002", seq: 14, src: "https://storep-phinf.pstatic.net/cafe_002/original_14.gif" },
  { packCode: "cafe_002", seq: 21, src: "https://storep-phinf.pstatic.net/cafe_002/original_21.gif" },
  { packCode: "cafe_003", seq: 3, src: "https://storep-phinf.pstatic.net/cafe_003/original_3.gif" },
  { packCode: "cafe_003", seq: 6, src: "https://storep-phinf.pstatic.net/cafe_003/original_6.gif" },
  { packCode: "cafe_003", seq: 24, src: "https://storep-phinf.pstatic.net/cafe_003/original_24.gif" },
  { packCode: "cafe_003", seq: 16, src: "https://storep-phinf.pstatic.net/cafe_003/original_16.gif" },
  { packCode: "cafe_004", seq: 4, src: "https://storep-phinf.pstatic.net/cafe_004/original_4.png" },
  { packCode: "cafe_004", seq: 25, src: "https://storep-phinf.pstatic.net/cafe_004/original_25.png" },
  { packCode: "cafe_012", seq: 1, src: "https://storep-phinf.pstatic.net/cafe_012/original_1.png" },
  { packCode: "cafe_012", seq: 23, src: "https://storep-phinf.pstatic.net/cafe_012/original_23.png" },
  { packCode: "cafe_006", seq: 12, src: "https://storep-phinf.pstatic.net/cafe_006/original_12.png" },
  { packCode: "cafe_007", seq: 1, src: "https://storep-phinf.pstatic.net/cafe_007/original_1.png" },
  { packCode: "cafe_008", seq: 1, src: "https://storep-phinf.pstatic.net/cafe_008/original_1.png" },
  { packCode: "cafe_008", seq: 2, src: "https://storep-phinf.pstatic.net/cafe_008/original_2.png" },
  { packCode: "cafe_008", seq: 3, src: "https://storep-phinf.pstatic.net/cafe_008/original_3.png" },
  { packCode: "cafe_008", seq: 11, src: "https://storep-phinf.pstatic.net/cafe_008/original_11.png" },
  { packCode: "cafe_008", seq: 15, src: "https://storep-phinf.pstatic.net/cafe_008/original_15.png" },
  { packCode: "cafe_008", seq: 7, src: "https://storep-phinf.pstatic.net/cafe_008/original_7.png" },
  { packCode: "cafe_009", seq: 2, src: "https://storep-phinf.pstatic.net/cafe_009/original_2.png" },
  { packCode: "cafe_010", seq: 2, src: "https://storep-phinf.pstatic.net/cafe_010/original_2.png" },
  { packCode: "cafe_010", seq: 4, src: "https://storep-phinf.pstatic.net/cafe_010/original_4.png" },
  { packCode: "cafe_010", seq: 6, src: "https://storep-phinf.pstatic.net/cafe_010/original_6.png" },
  { packCode: "cafe_010", seq: 15, src: "https://storep-phinf.pstatic.net/cafe_010/original_15.png" },
  { packCode: "cafe_007", seq: 17, src: "https://storep-phinf.pstatic.net/cafe_007/original_17.png" }
];

async function getBlogNo(sessionData) {
  const config = {
    method: 'get',
    url: `https://blog.naver.com/PostList.naver?blogId=${BLOG_ID}&widgetTypeCall=true&topReferer=https%3A%2F%2Fblog.naver.com%2FPostList.naver%3FblogId%3D${BLOG_ID}&trackingCode=blog_bloghome&directAccess=true`,
    headers: {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'cookie': sessionData.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
      'referer': `https://blog.naver.com/${BLOG_ID}`,
      'user-agent': getRandomUserAgent(),
    },
  };

  try {
    const response = await axios(config);
    const blogNoMatch = response.data.match(/var blogNo = '(\d+)';/);
    if (blogNoMatch) {
      return blogNoMatch[1];
    } else {
      throw new Error('blogNo not found');
    }
  } catch (error) {
    console.error('Error fetching blogNo:', error);
    throw error;
  }
}

async function postComment(postId, products, cboxToken, sessionData, blogNo, crawledData) {
  const emojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  const phrases = ['최고의 선택!', '놓치지 마세요!', '강력 추천!', '인기 상품!', '베스트 아이템!', '필수 체크!', '주목할 제품!', '핫한 아이템!', '인기 급상승!', '놓치면 후회할 제품!'];

  // console.log('Received products:', JSON.stringify(products, null, 2));  // 디버깅용 로그

  const sortedProducts = Object.entries(products)
    .filter(([key, product]) => {
      product.review_count = product.review_count || 0; // 리뷰 수가 없으면 0으로 설정 
      const isValid = product && typeof product === 'object' && 
                      product.review_count && product.name && product.price && product.keyword && product.category;
      if (!isValid) {
        console.log(`Filtered out product: ${key}`, product);  // 디버깅용 로그
      }
      return isValid;
    })
    .sort(([, a], [, b]) => b.review_count - a.review_count)
    .map(([, product]) => product);

  const commentLines = [];

for (let index = 0; index < sortedProducts.length; index++) {
  const product = sortedProducts[index];
  const rank = product.review_count;
  const productName = product.name;

  const longaffiliateUrl = createAffiliateUrl(product);
  const affiliateUrl = await transformShortLink(longaffiliateUrl);

  console.log(`${index} related product affiliateUrl  --- >`, affiliateUrl);

  const price = product.price;
  const rating = product.review_count;
  const reviewCount = product.review_count;

  const emoji = emojis[index] || `${rank}️⃣`;
  const phrase = phrases[index % phrases.length];

  const line = `${emoji} [${index+1}위] ${productName}\n💰 가격: ${price}\n⭐ 평점: ${rating} (${reviewCount}개 리뷰)\n👉 ${phrase}\n🛒 할인현황보기: ${affiliateUrl}\n`;

  commentLines.push(line);
}

  const keyword = sortedProducts[0].category || '상품';
  const productCount = sortedProducts.length;
  const headerLine = `🏆 ${keyword} BEST ${productCount} 🏆\n\n`;
  const footerLine = `\n${partnerNotice}\n`;

  const comment = headerLine + commentLines.join('\n') + footerLine;

  // console.log('Final comment:', comment);
  const payload = `lang=ko&country=&objectId=${blogNo}_201_${postId}&categoryId=&pageSize=50&indexSize=10&groupId=${blogNo}&listType=OBJECT&pageType=default&clientType=web-pc&objectUrl=${encodeURIComponent(`https://blog.naver.com/PostList.naver?blogId=${BLOG_ID}`)}&contents=${encodeURIComponent(comment)}&userType=&pick=false&manager=false&score=0&likeItId=${BLOG_ID}_${postId}&sort=NEW&secret=false&refresh=true&imageCount=0&commentType=txt&validateBanWords=true&cbox_token=${cboxToken}`;
  
  const commentConfig = {
    method: 'post',
    url: 'https://apis.naver.com/commentBox/cbox/web_naver_create_json.json?ticket=blog&templateId=default&pool=blogid',
    headers: {
      'accept': 'application/json, text/javascript, */*; q=0.01',
      'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'cookie': sessionData.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
      'origin': 'https://blog.naver.com',
      'referer': `https://blog.naver.com/PostList.naver?blogId=${BLOG_ID}`,
      'user-agent': getRandomUserAgent(),
    },
    data: payload,
  };

  try {
    const response = await axios(commentConfig);
    console.log('댓글 발행 성공');
    return response.data;
  } catch (error) {
    console.error('댓글 작성 중 오류 발생:', error);
    throw error;
  }
}

//파트너스 url -> 숏링크로 변환
async function transformShortLink(affiliateUrl) {
  const urlToShorten = affiliateUrl;
  const maxRetries = 3;

  // is.gd API 시도
  for (let i = 0; i < maxRetries; i++) {
    try {
      const apiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(urlToShorten)}`;
      const response = await axios.get(apiUrl);
      const shortUrl = response.data;
      console.log(` [is.gd] 변환 성공: ${shortUrl}`);
      return shortUrl;
    } catch (err) {
      console.log(` [is.gd] 시도 ${i + 1}/${maxRetries} 실패`);
      if (i === maxRetries - 1) {
        console.log(" [is.gd] 모든 시도 실패, TinyURL 시도로 전환");
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // 재시도 전 1초 대기
  }

  // TinyURL API 시도
  for (let i = 0; i < maxRetries; i++) {
    try {
      const apiUrl = `http://tinyurl.com/api-create.php?url=${encodeURIComponent(urlToShorten)}`;
      const response = await axios.get(apiUrl);
      const shortUrl = response.data;
      console.log(` [TinyURL] 변환 성공: ${shortUrl}`);
      return shortUrl;
    } catch (err) {
      console.log(` [TinyURL] 시도 ${i + 1}/${maxRetries} 실패`);
      if (i === maxRetries - 1) {
        console.log(" [알림] 모든 숏링크 변환 시도 실패, 원본 URL 사용");
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // 재시도 전 1초 대기
  }

  // 모든 시도 실패시 원본 URL 반환
  console.log(" [최종] 원본 URL 사용:", urlToShorten);
  return urlToShorten;
}

function createAffiliateUrl(productInfo) {
  try {
    const { page_key, item_id, vendor_item_id } = productInfo;
    
    const pageKey = page_key;
    const itemId = item_id;
    const vendorItemId = vendor_item_id;

    // 필수 값 체크
    if (!pageKey || !itemId || !vendorItemId) {
      console.log('[어필리에이트 URL 생성 실패]');
      console.log('필요한 정보가 누락됨:', { pageKey, itemId, vendorItemId });
      return DEFAULT_URL;
    }

    // 랜덤 traceid 생성 (bin2hex 대신 다른 방법 사용)
    const randomBytes = crypto.randomBytes(8);
    const traceid = 'V0-181-' + randomBytes.toString('hex');
    
    // const productType = productInfo.url.includes('/vp/products/') ? "AFFSDP" : "AFFTDP";
    const productType = "AFFSDP";

    const url = `https://link.coupang.com/re/${productType}?lptag=${AFFILIATE_ID}&subid=${CHANNEL_ID}&pageKey=${pageKey}&traceid=${traceid}&itemId=${itemId}&vendorItemId=${vendorItemId}`;
    
    console.log('[어필리에이트 URL 생성 성공]:', url);
    return url;
  } catch (error) {
    console.error("어필리에이트 URL 생성 중 오류:", error);
    return DEFAULT_URL;
  }
}

async function updatePost(blogId, documentModel, populationParams, sessionData) {
  const updateConfig = {
    method: 'post',
    url: 'https://blog.naver.com/RabbitUpdate.naver',
    headers: {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'content-type': 'application/x-www-form-urlencoded',
      'cookie': sessionData.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
      'origin': 'https://blog.naver.com',
      'priority': 'u=1, i',
      'referer': `https://blog.naver.com/${blogId}/postupdate?logNo=${populationParams.populationMeta.logNo}`,
      'sec-ch-ua': '\"Not/A)Brand\";v=\"8\", \"Chromium\";v=\"126\", \"Google Chrome\";v=\"126\"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '\"Windows\"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': getRandomUserAgent(),
    },
    data: `blogId=${blogId}&documentModel=${encodeURIComponent(JSON.stringify(documentModel))}&populationParams=${encodeURIComponent(JSON.stringify(populationParams))}&productApiVersion=v1`,
  };

  try {
    const updateResponse = await axios(updateConfig);
    // console.log("성공");
    // console.log("URL:", updateResponse.data.result.redirectUrl);
    return updateResponse.data;
  } catch (error) {
    console.error("포스트 수정 중 오류 발생:", error);
    throw error;
  }
}


function getRandomMs(minMinutes, maxMinutes) {
  const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1) + minMinutes);
  return randomMinutes * 60 * 1000; // 밀리초로 변환
}

function getFormattedTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `${year}.${month}.${day} ${hour}:${minute}:${second}`;
}


function logWithTime(...args) {
  const timestamp = getFormattedTime();
  console.log(`[${timestamp}]`, ...args);
}

async function main() {
  try {
    // await checkAndRunLoginScript();
    // await runPrerequisiteScripts();
    let config = await configInfo();
    await loadAllCookies();
    const user = userJSON;
    logWithTime('사용자 정보:', user);

    // console.log('userCookies ---> ', userCookies);
    const tmpCookie = userCookies.find(cookie => cookie.userId === user.id);
    // console.log('tmpCookie ---> ', tmpCookie);
    const userCookieObj = JSON.parse(tmpCookie.cookie);
    const sessionData = {"cookies": userCookieObj};
    userCookieObj.forEach(cookie => {
    jar.setCookieSync(`${cookie.name}=${cookie.value}`, BASE_URL, { domain: cookie.domain, path: cookie.path, secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite });
  });

    let seAuthToken;
    let sessionKey;

    try {
      seAuthToken = await getToken();
      // console.log('token ---> token');
      sessionKey = await getSessionKey(seAuthToken);
      //  console.log('sessionKey ---> sessionKey');
    }catch(error){
      console.error('토큰, 세션키 받는중 에러 ---> ', error);
      exit(1);
    }

    
    // const rawData = fs.readFileSync(RESULT_FILE, 'utf8');
    // const crawledData = JSON.parse(rawData);

    // const groupedProducts = {
    //   full: [],
    //   partial: [],
    //   minimal: [],
    //   none: []
    // };
    
    // // 모든 상품을 디테일 이미지 갯수에 따라 정렬
    // const sortedProducts = Object.values(crawledData).sort((a, b) => {
    //   const aImages = a['디테일 이미지'] ? a['디테일 이미지'].length : 0;
    //   const bImages = b['디테일 이미지'] ? b['디테일 이미지'].length : 0;
    //   return bImages - aImages;  // 내림차순 정렬
    // });
    
    // // 정렬된 상품들을 리뷰 정보에 따라 분류
    // sortedProducts.forEach(product => {
    //   if (product.리뷰) {
    //     const hasTitle = !!product.리뷰.제목;
    //     const hasContent = !!product.리뷰.내용;
    //     const hasSurvey = Array.isArray(product.리뷰.설문) && product.리뷰.설문.length > 0;
    
    //     const reviewCount = [hasTitle, hasContent, hasSurvey].filter(Boolean).length;
    
    //     if (reviewCount === 3) groupedProducts.full.push(product);
    //     else if (reviewCount === 2) groupedProducts.partial.push(product);
    //     else if (reviewCount === 1) groupedProducts.minimal.push(product);
    //     else groupedProducts.none.push(product);
    //   } else {
    //     groupedProducts.none.push(product);
    //   }
    // });
    
    // // 우선순위에 따라 상품 선택
    // let selectedGroup;
    // if (groupedProducts.full.length > 0) selectedGroup = groupedProducts.full;
    // else if (groupedProducts.partial.length > 0) selectedGroup = groupedProducts.partial;
    // else if (groupedProducts.minimal.length > 0) selectedGroup = groupedProducts.minimal;
    // else selectedGroup = groupedProducts.none;
    

    const productInfo = await getCoupangData();
    // 선택된 그룹의 첫 번째 상품 (이미 디테일 이미지 수로 정렬되어 있음)
    const firstProduct = productInfo;

    // 제목 생성
    const creativeTitle = await generateCreativeTitle(firstProduct['name']);
    // console.log(`제목: ${creativeTitle}`);

    // 첫 인사말 생성
    const greeting = await generateGreeting(firstProduct['name']);
    // console.log(`첫 인사말: ${greeting}`);

    // 본문 내용 생성 (새로운 API 키 사용)
    const reviewContent = await geminiReview(firstProduct['name']);
    // console.log("생성된 리뷰 내용:", reviewContent);

    // 상품 후기 생성 (첫 번째 API 키 사용)
    let productReviews = [];
    try {
      productReviews = await generateProductReviews(firstProduct['name']);
      // console.log("생성된 상품 후기:", productReviews);
    } catch (error) {
      console.error("상품 후기 생성 실패:", error);
      // 상품 후기 생성에 실패해도 계속 진행
    }

    const mainImg = productInfo.main_image;
    const thumbNailImgArr = [];
    
    for (let index = 1; index <= 10; index++) {
      productInfo[`thumbnail_${index}`] && thumbNailImgArr.push(productInfo[`thumbnail_${index}`]);
    }
    
    const imgAllUrlArr = [];
    imgAllUrlArr.push(mainImg);
    imgAllUrlArr.push(...thumbNailImgArr);
    console.log('imgAllUrlArr ---> ', imgAllUrlArr);

    const detailImages = thumbNailImgArr || [];
    let imagesToUpload = [];

    // 항상 썸네일 이미지를 첫 번째로 추가
    // const thumbnailImageUrl = firstProduct['main_image'].startsWith("//") 
    //     ? `https:${firstProduct['main_image']}` 
    //     : firstProduct['main_image'];
    imagesToUpload.push(mainImg);

    // 디테일 이미지가 있다면 추가
    if (detailImages.length > 0) {
        imagesToUpload = imagesToUpload.concat(detailImages);
    }

    // 각 이미지마다 랜덤 스타일 적용
    const convertedImages = await Promise.all(
        imagesToUpload.map((imageUrl, index) => downloadAndConvertImage(imageUrl, index))
    );

    // anne.jpg 
    const anneBuffer = await fs.promises.readFile(ANNE_IMAGE);
    const selectedFrameStyle = getRandomFrameStyle();
    const framedAnneBuffer = await selectedFrameStyle(anneBuffer);
    const framedAnneFilename = 'framed_anne.jpg';
    await sharp(framedAnneBuffer).toFile(framedAnneFilename);
    
    convertedImages.push(framedAnneFilename);
    const uploadedImages = await Promise.all(
      convertedImages.map(imagePath => uploadImage(sessionKey, imagePath))
    );
    
    convertedImages.forEach(imagePath => {
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    });
    
    const documentModel = await createDocumentModel(firstProduct, uploadedImages, BLOG_ID, null, creativeTitle, greeting, productReviews, productInfo.relatedProducts);
    // console.log('documentModel ----> ', JSON.stringify(documentModel, null, 2));

    const populationParams = createPopulationParams(uploadedImages);
    // console.log('populationParams ----> ', JSON.stringify(populationParams, null, 2));
    
    const autoSaveData = await autoSave(documentModel, populationParams);
    console.log("AutoSave 데이터:", JSON.stringify(autoSaveData, null, 2)); 
    
    let autoSaveNo;
    if (autoSaveData && autoSaveData.result && autoSaveData.result.autoSaveNo) {
      autoSaveNo = autoSaveData.result.autoSaveNo;
    } else {
      console.error("자동 저장 번호를 찾을 수 없습니다.");
      autoSaveNo = null;
    }
    
    const publishResult = await publishPost(autoSaveNo, documentModel, populationParams);
    if (publishResult.isSuccess && publishResult.result && publishResult.result.redirectUrl) {
      console.log("포스트 발행 결과 : " + publishResult.result.redirectUrl);
    
      const postId = new URL(publishResult.result.redirectUrl).searchParams.get('logNo');
    
      if (UPDATE_LINK == 1) {
        const updatedDocumentModel = await createDocumentModel(firstProduct, uploadedImages, BLOG_ID, postId, creativeTitle, greeting, productReviews, productInfo.relatedProducts);
    
        const updatedPopulationParams = createPopulationParams(uploadedImages, null, postId);
    
        await updatePost(BLOG_ID, updatedDocumentModel, updatedPopulationParams, sessionData);
      }
    
      try {
        const blogNo = await getBlogNo(sessionData);

        const cboxTokenConfig = {
          method: 'get',
          url: `https://apis.naver.com/commentBox/cbox/web_naver_token_jsonp.json?ticket=blog&templateId=default&pool=blogid&_cv=${Date.now()}&_callback=jQuery${Math.floor(Math.random() * 1000000000000)}_${Date.now()}&lang=ko&country=&objectId=${blogNo}_201_${postId}&categoryId=&pageSize=50&indexSize=10&groupId=${blogNo}&listType=OBJECT&pageType=default&_=${Date.now()}`,
          headers: {
            'accept': '*/*',
            'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'cookie': sessionData.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
            'referer': `https://blog.naver.com/PostList.naver?blogId=${BLOG_ID}`,
            'sec-ch-ua': '\"Not/A)Brand\";v=\"8\", \"Chromium\";v=\"126\", \"Google Chrome\";v=\"126\"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '\"Windows\"',
            'sec-fetch-dest': 'script',
            'sec-fetch-mode': 'no-cors',
            'sec-fetch-site': 'same-site',
            'user-agent': getRandomUserAgent(),
          },
        };

        const cboxTokenResponse = await axios(cboxTokenConfig);
        const cboxTokenData = cboxTokenResponse.data;
        const jsonData = cboxTokenData.slice(cboxTokenData.indexOf('(') + 1, cboxTokenData.lastIndexOf(')'));
        const parsedData = JSON.parse(jsonData);

        if (parsedData.success && parsedData.result && parsedData.result.cbox_token) {

          // 1. relatedProducts만 분리하고
          const relatedProducts = productInfo.relatedProducts || [];

          // 2. 원본 객체에서 제거
          delete productInfo.relatedProducts;

          // 3. 하나의 배열로 병합
          const allProducts = [productInfo, ...relatedProducts];
          
          const commentResult = await postComment(postId, allProducts, parsedData.result.cbox_token, sessionData, blogNo, productInfo.relatedProducts);
  
          if (commentResult.success) {
            console.log("댓글이 성공적으로 작성되었습니다.");
          } else {
            console.error("댓글 작성 실패:", commentResult.message);
          }
        } else {
          console.error("cbox_token 값을 가져오는데 실패했습니다.");
        }

      } catch (error) {
        console.error("블로그 번호를 가져오거나 댓글을 작성하는 중 오류가 발생했습니다:", error);
      }
    } else {
      console.error("포스트 발행 실패");
      console.error(publishResult);
    }

  } catch (error) {
    console.error("치명적인 오류 발생:", error);
    if (error.response) {
      console.error("응답 상태:", error.response.status);
      console.error("응답 데이터:", error.response.data);
    }
    process.exit(1); // 프로세스를 즉시 종료합니다.
  }
}

// main 함수 호출
main().catch(error => {
  console.error("Unhandled error in main:", error);
  process.exit(1);
});