const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const mysql = require('mysql2/promise');


let geminiKeys = [];
let allConfig = null;
let dbConfigPost = {};
const pic_type = 'real';

let AFFILIATE_ID;
let CHANNEL_ID;
let DEFAULT_URL;
let MY_EMAIL;
let TOTAL_IMG_COUNT = 0;
let dbConfig = {};
let BLOG_ID;
let BLOG_NAME;
let BLOG_URL;

let useProxy;
let httpsAgent;

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
    // console.log('✅ 컨피그 ----> ', config);
    console.log('✅ 컨피그 파일 로드 완료:');

    geminiKeys = config.geminiKeys || [];
    allConfig = config;

    dbConfig = config.database.hotel;
    dbConfigPost = config.database.naverPost;

    
    return config;
  } catch (error) {
    console.error('❌ JSON 파일 로딩 실패:', error);
  }finally{
    await connection.end();
  }
}



// ========================================
// 🎯 자동화 실행 횟수 설정
// ========================================
const AUTO_RUN_COUNT = 1; // 원하는 횟수로 변경하세요 (예: 5번 실행)

// 실행할 스크립트 목록
const scripts = [
    { name: '1.crawl.js', description: '상품 정보 크롤링' },
    { name: '2.gemini_run.js', description: 'AI 리뷰 생성' },
    { name: '3.post.js', description: '블로그 포스팅' }
];

// 색상 코드 (터미널 출력용)
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

// 스크립트 실행 함수
function runScript(scriptPath, user, blog, config, cookie, logInfo) {
    return new Promise((resolve, reject) => {
        console.log(`${colors.cyan}실행 중: ${scriptPath}${colors.reset}`);
        const child = spawn('node', [scriptPath, JSON.stringify(geminiKeys), JSON.stringify(user), JSON.stringify(cookie)], {
            cwd: __dirname,
            stdio: 'inherit', // 자식 프로세스의 출력을 현재 프로세스로 전달
            shell: false
        });

        child.on('error', (error) => {
            console.error(`${colors.red}오류 발생: ${error.message}${colors.reset}`);
            reject(error);
        });

        child.on('exit', (code) => {
            if (code === 0) {
                console.log(`${colors.green}✓ 완료: ${scriptPath}${colors.reset}\n`);
                resolve();
            } else {
                const error = new Error(`스크립트가 오류 코드 ${code}로 종료됨`);
                console.error(`${colors.red}✗ 실패: ${scriptPath} (종료 코드: ${code})${colors.reset}`);
                reject(error);
            }
        });
    });
}

function runCoupang(user, blog, config, cookie, logInfo) {
    const scriptPath = path.join(__dirname, '5.coupang.js');
    const smallConfig = {  
      AFFILIATE_ID: config.AFFILIATE_ID,
      CHANNEL_ID: config.CHANNEL_ID,
      DEFAULT_URL: config.DEFAULT_URL,
      MY_EMAIL: config.MY_EMAIL,
      geminiModel: config.geminiModel
    };

    return new Promise((resolve, reject) => {
        console.log(`${colors.cyan}실행 중: ${scriptPath}${colors.reset}`);
        const child = spawn('node', [scriptPath, JSON.stringify(geminiKeys), JSON.stringify(user), JSON.stringify(cookie), JSON.stringify(smallConfig)], {
            cwd: __dirname,
            stdio: 'inherit', // 자식 프로세스의 출력을 현재 프로세스로 전달
            shell: false
        });

        child.on('error', (error) => {
            console.error(`${colors.red}오류 발생: ${error.message}${colors.reset}`);
            reject(error);
        });

        child.on('exit', (code) => {
            if (code === 0) {
                console.log(`${colors.green}✓ 완료: ${scriptPath}${colors.reset}\n`);
                resolve();
            } else {
                const error = new Error(`스크립트가 오류 코드 ${code}로 종료됨`);
                console.error(`${colors.red}✗ 실패: ${scriptPath} (종료 코드: ${code})${colors.reset}`);
                reject(error);
            }
        });
    });
}

// 메인 실행 함수
async function runAll(user, blog, config, cookie, logInfo) {
    console.log(`${colors.bright}${colors.cyan}========================================`);
    console.log('  네이버 쇼핑 자동 포스팅 시스템 시작');
    console.log(`  총 ${AUTO_RUN_COUNT}번 실행 예정`);
    console.log(`========================================${colors.reset}\n`);
    
    const totalStartTime = Date.now();
    
    try {
        // 환경변수 체크
        // require('dotenv').config();
        // const requiredEnvVars = ['POST_ID', 'POST_PASSWORD', 'GEMINI_API_KEY'];
        // const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        // if (missingVars.length > 0) {
        //     console.error(`${colors.red}필수 환경변수가 설정되지 않았습니다:${colors.reset}`);
        //     missingVars.forEach(varName => {
        //         console.error(`  - ${varName}`);
        //     });
        //     console.log('\n.env 파일에 위 환경변수들을 설정해주세요.');
        //     process.exit(1);
        // }
        
        // 설정된 횟수만큼 전체 프로세스 반복 실행
        for (let cycle = 1; cycle <= AUTO_RUN_COUNT; cycle++) {
            console.log(`${colors.bright}${colors.yellow}🔄 [${cycle}/${AUTO_RUN_COUNT}] 사이클 시작${colors.reset}`);
            console.log(`${'='.repeat(50)}\n`);
            
            const cycleStartTime = Date.now();
            
            // 각 스크립트 순차 실행
            for (let i = 0; i < scripts.length; i++) {
                const script = scripts[i];
                const scriptPath = path.join(__dirname, script.name);
                
                // 파일 존재 확인
                if (!fs.existsSync(scriptPath)) {
                    console.error(`${colors.red}파일을 찾을 수 없습니다: ${script.name}${colors.reset}`);
                    process.exit(1);
                }
                
                console.log(`${colors.yellow}[${i + 1}/${scripts.length}] ${script.description}${colors.reset}`);
                console.log('-'.repeat(40));
                
                await runScript(scriptPath, user, blog, config, cookie, logInfo);
                
                // 다음 스크립트 실행 전 잠시 대기 (마지막 스크립트 제외)
                if (i < scripts.length - 1) {
                    console.log(`다음 단계 준비 중...\n`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            const cycleElapsedTime = Math.round((Date.now() - cycleStartTime) / 1000);
            const cycleMinutes = Math.floor(cycleElapsedTime / 60);
            const cycleSeconds = cycleElapsedTime % 60;
            
            console.log(`${colors.green}✅ [${cycle}/${AUTO_RUN_COUNT}] 사이클 완료! (소요시간: ${cycleMinutes}분 ${cycleSeconds}초)${colors.reset}`);
            
            // 다음 사이클 실행 전 대기 (마지막 사이클 제외)
            if (cycle < AUTO_RUN_COUNT) {
                console.log(`${colors.cyan}⏳ 다음 사이클 준비 중... (10초 대기)\n${colors.reset}`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
        
        const totalElapsedTime = Math.round((Date.now() - totalStartTime) / 1000);
        const totalMinutes = Math.floor(totalElapsedTime / 60);
        const totalSeconds = totalElapsedTime % 60;
        
        console.log(`${colors.bright}${colors.green}========================================`);
        console.log('  🎉 모든 자동화 작업이 성공적으로 완료되었습니다!');
        console.log(`  총 실행 횟수: ${AUTO_RUN_COUNT}번`);
        console.log(`  총 소요 시간: ${totalMinutes}분 ${totalSeconds}초`);
        console.log(`========================================${colors.reset}\n`);
        
    } catch (error) {
        const elapsedTime = Math.round((Date.now() - totalStartTime) / 1000);
        
        console.error(`\n${colors.bright}${colors.red}========================================`);
        console.error('  작업 중 오류가 발생했습니다');
        console.error(`  오류: ${error.message}`);
        console.error(`  소요 시간: ${elapsedTime}초`);
        console.error(`========================================${colors.reset}\n`);
        
        // 오류 발생 시 정리 작업
        console.log(`${colors.yellow}정리 작업을 수행합니다...${colors.reset}`);
        try {
            // result.json이 남아있으면 삭제
            const resultPath = path.join(__dirname, 'result.json');
            if (fs.existsSync(resultPath)) {
                fs.unlinkSync(resultPath);
                console.log('- result.json 삭제 완료');
            }
            
            // imgs 폴더 정리
            const imgsDir = path.join(__dirname, 'imgs');
            if (fs.existsSync(imgsDir)) {
                const files = fs.readdirSync(imgsDir);
                for (const file of files) {
                    fs.unlinkSync(path.join(imgsDir, file));
                }
                console.log(`- imgs 폴더 정리 완료 (${files.length}개 파일 삭제)`);
            }
            
            // 동영상 파일 삭제
            const files = fs.readdirSync(__dirname);
            const videoFiles = files.filter(file => file.endsWith('_slideshow.mp4'));
            for (const videoFile of videoFiles) {
                fs.unlinkSync(path.join(__dirname, videoFile));
                console.log(`- 동영상 파일 삭제: ${videoFile}`);
            }
            
        } catch (cleanupError) {
            console.error(`정리 작업 중 오류: ${cleanupError.message}`);
        }
        
        process.exit(1);
    }
}

// 실행
// console.clear(); // 터미널 클리어 (선택사항)
// runAll();



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
    
    console.log('server id ---- ', server?.id);
    console.log('server proxy ---- ', server?.proxy);
    useProxy = server?.proxy;

    // const thisServerId = server.id;
    const thisServerId = 99;

    const membersArr = allConfig.members.filter(member => member.server.find(item => item === thisServerId));
    console.log('membersArr ---- ', membersArr);

    const filteredMembers = membersArr.filter(member => member.run === true && member.type === "cafe");
    
    return filteredMembers;

  } catch (error) {
    console.error('데이타베이스에서 퍼블릭 IP로 유저 조회중 오류가 발생했습니다:', error);
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


const getTargetBlogs = async () => {
  let connection = null;
  try {
    console.log('dbConfigPost ---> ', dbConfigPost);
    connection = await mysql.createConnection(dbConfigPost);
    // console.log('DB 연결 성공');
    
    await connection.query(`USE ${dbConfigPost.database}`);
    // console.log('DB 선택 성공');
    
    const [rows] = await connection.execute(`
      SELECT a.clubid, a.memberid, b.clubname, b.cluburl, b.targetMenus 
      FROM coupang_target_blog_member a, coupang_target_blog b
		  WHERE a.clubid = b.clubid 
      ORDER BY a.created_at		
    `);

    await connection.end();

    console.log('데이타베이스에서 타켓 블로그 정보를 성공적으로 불러왔습니다.');
    
    const blogs = rows;
    console.log('✅ 블로그 로드 완료:', blogs);

    return blogs;
  } catch (error) {
    console.error('❌ 블로그 로딩 실패:', error);
  }finally{
    await connection.end();
  }
}

async function runNaverPartner(user, blog, config, cookie, logInfo){
  await runAll(user, blog, config, cookie, logInfo);
}

async function runCoupangPartner(user, blog, config, cookie, logInfo){
  await runCoupang(user, blog, config, cookie, logInfo);
}
// console.clear();
async function main() {

  let config = await configInfo();
  await loadAllCookies();

//   AFFILIATE_ID = allConfig.AFFILIATE_ID;
//   CHANNEL_ID = allConfig.CHANNEL_ID;
//   DEFAULT_URL = allConfig.DEFAULT_URL;
//   MY_EMAIL = allConfig.MY_EMAIL;

  // console.log(allConfig.database);

  dbConfig = {
    host: allConfig.database.coupang.host,
    user: allConfig.database.coupang.user,
    password: allConfig.database.coupang.password,
    database: allConfig.database.coupang.database
  };

//   const allBlogs = await getTargetBlogs();
  const users = await getValidUsers();
  // logWithTime('users:', users);
//   setProxy();
  
  // let blogs = config.blogs;
  geminiKeys = config.geminiKeys; // 글로벌 변수

  while(true){
    for (let index = 0; index < users.length; index++) {
      const user = users[index];
      logWithTime('사용자 정보:', user);
      const blog = {};
      blog.blogId = user.blogId;
      blog.blogContent = user.blogContent;

      const tmpCookie = userCookies.find(cookie => cookie.userId === user.id);
      console.log(tmpCookie.userId);
      // console.log(JSON.parse(tmp.cookie));
      const cookie = JSON.parse(tmpCookie.cookie);

    //   const blog = allBlogs.filter(blog => blog.memberid === user.id);   
      // console.log('blogs ---> ', blogs);
    //   for (let blogIndex = 0; blogIndex < blogs.length; blogIndex++) {
        
        // const blog = blogs[blogIndex];
        logWithTime('블로그 정보:', blog);
        // BLOG_ID = blog.clubid;
        // BLOG_NAME = blog.clubname;
        // BLOG_URL = blog.cluburl;
        logWithTime(`\n사용자: ${user.id}, 블로그: ${blog})`);
        
        logWithTime(`포스팅을 시작합니다...`);
        const logInfo = {};
        logInfo.blogId = blog.blogId;
        logInfo.blogUrl = '';
        logInfo.blogName = user.nickName;
        logInfo.userId = user.id;
        logInfo.nickName = user.nickName;

        for (let index = 0; index < user.blogContent.length; index++) {
          const content = user.blogContent[index];
          if(content === 'N'){
            await runNaverPartner(user, blog, config, cookie, logInfo);
          }else if(content === 'C'){
            await runCoupangPartner(user, blog, config, cookie, logInfo);
          }
        }
        // await runForPost(user, blog, config, cookie, logInfo);
        logWithTime(`블로그 ${blog.blogId} ${user.nickName}에 대한 포스팅을 완료했습니다.`);
        logWithTime(`새 포스팅 시작전 30 ~ 60분 대기...`);
        await new Promise(resolve => setTimeout(resolve, getRandomMs(30, 60)));  
        
      }
    // }
    logWithTime(`모든 유저의 블로그에 대한 포스팅을 완료했습니다. 5분에서 10분 대기 후 다시 시작합니다...`);
    await new Promise(resolve => setTimeout(resolve, getRandomMs(5, 10)));
  }
} 


main().catch(error => {
  console.error("Unhandled error in main function:", error);
});
