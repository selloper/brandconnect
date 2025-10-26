const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();
const { login, loadLoginData, saveLoginData } = require('./lib/login-module');

// User-Agent 목록
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
];

// 랜덤 User-Agent 선택 함수
function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// =============== 설정 변수 ===============
// 크롤링할 카테고리 선택 (아래 카테고리 중 하나 선택, 빈 값이면 랜덤)
let SELECTED_CATEGORY = "";  // 빈 값이면 랜덤 카테고리 선택

// 크롤링할 상품 개수 제한
const LIMIT = 1;  // 원하는 개수로 변경 (예: 3, 10, 50, 100)

// 선택 방식 (0: 순서대로, 1: 랜덤)
const LIMIT_TYPE = 1;  // 0: 순서대로 가져오기, 1: 랜덤으로 가져오기

// 카테고리별 ID 매핑
const categoryIdMap = {
  "생활/건강": "50000002",
  "디지털/가전": "50000003",
  "식품": "50000006",
  "화장품/미용": "50000001",
  "패션잡화": "50000005",
  "가구/인테리어": "50000004",
  "스포츠/레저": "50000007",
  "출산/육아": "50000008",
  "패션의류": "50000000",
  "여가/생활편의": "50000009"
};

// 네이버 쇼핑 카테고리 목록
const categories = Object.keys(categoryIdMap);

// 특별 프로모션 카테고리
const promotionCategories = [
  "전체",
  "강세일",
  "슈퍼적립",
  "원쁠딜",
  "브랜드데이",
  "신상위크"
];


// 쿠키 파일 경로 가져오기
function getCookieFilePath(userId) {
  const cookiesDir = path.join(__dirname, 'cookies');
  if (!fs.existsSync(cookiesDir)) {
    fs.mkdirSync(cookiesDir);
  }
  return path.join(cookiesDir, `${userId}_cookies.json`);
}

// 쿠키 및 로그인 데이터 가져오기
function getLoginData(userId) {
  const cookieFilePath = getCookieFilePath(userId);
  console.log('cookieFilePath --- ', cookieFilePath);
  if (fs.existsSync(cookieFilePath)) {
    try {
      const dataString = fs.readFileSync(cookieFilePath, 'utf8');
      const loginData = JSON.parse(dataString);
      
      console.log('loginData --- ', loginData);
      let cookies = [];
      let spaceId = null;
      
      // 구버전 호환성 체크 (cookies 배열만 있는 경우)
      if (Array.isArray(loginData)) {
        cookies = loginData;
      } else if (loginData.cookies) {
        cookies = loginData.cookies;
        spaceId = loginData.spaceId;  // 저장된 space-id 가져오기
      }
      
      // 쿠키 배열을 문자열로 변환
      const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
      
      return {
        cookieString: cookieString,
        spaceId: spaceId
      };
    } catch (error) {
      console.error("로그인 데이터 로드 오류:", error);
      return null;
    }
  }
  return null;
}

// API 요청으로 상품 데이터 가져오기
async function fetchProducts(categoryId, limit, cookieString, spaceId) {
  
  try {
    // 100개 이하인 경우 100개를 가져온 후 랜덤 선택을 위해 항상 100개 요청
    const requestLimit = limit < 100 ? '100' : limit.toString();

    console.log('categroyId ---> ', categoryId);
    console.log('requestLimit ---> ', requestLimit);
    console.log('targetUrl ---> ', 'https://gw-brandconnect.naver.com/affiliate/query/shopping-promotions/products');
  
    
    const response = await axios.get('https://gw-brandconnect.naver.com/affiliate/query/shopping-promotions/products', {
      params: {
        'category1Id': categoryId,
        'limit': requestLimit,
      },
      headers: {
        'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'origin': 'https://brandconnect.naver.com',
        'priority': 'u=1, i',
        'referer': `https://brandconnect.naver.com/${spaceId}/affiliate/products/event`,
        'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'user-agent': getRandomUserAgent(),
        'x-space-id': spaceId,
        'sec-fetch-storage-access': 'active',
        'cookie': cookieString
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('API 요청 오류:', error.message);
    if (error.response) {
      console.log('Status Code:', error.response.status);
      // 401 오류를 상위로 전파
      if (error.response.status === 401) {
        const authError = new Error('Authentication failed');
        authError.code = 401;
        throw authError;
      }
    }
    throw error;
  }
}

// 배열에서 랜덤으로 n개 선택
function getRandomItems(array, n) {
  if (n >= array.length) return array;
  
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}

// 숫자를 천 단위로 포맷팅
function formatNumber(num) {
  if (num === null || num === undefined) return null;
  return num.toLocaleString('ko-KR');
}

// 이미지 다운로드 함수
async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {}); // 실패 시 파일 삭제
      reject(err);
    });
  });
}

// 모든 이미지 다운로드
async function downloadAllImages(products) {
  // imgs 폴더 생성
  const imgsDir = path.join(__dirname, 'imgs');
  if (!fs.existsSync(imgsDir)) {
    fs.mkdirSync(imgsDir, { recursive: true });
  } else {
    // 기존 이미지 파일 삭제
    const files = fs.readdirSync(imgsDir);
    files.forEach(file => {
      const filePath = path.join(imgsDir, file);
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    });
  }
  
  console.log('이미지 다운로드 시작...');
  let imageCounter = 1;
  
  for (const product of products) {
    const productImages = [];
    
    // 대표 이미지 다운로드
    if (product.대표이미지URL) {
      try {
        const ext = path.extname(new URL(product.대표이미지URL).pathname) || '.jpg';
        const filename = `product_${imageCounter}${ext}`;
        const filepath = path.join(imgsDir, filename);
        await downloadImage(product.대표이미지URL, filepath);
        productImages.push(filepath);
        console.log(`이미지 다운로드 완료: ${filename}`);
        imageCounter++;
      } catch (error) {
        console.error(`대표 이미지 다운로드 실패: ${error.message}`);
      }
    }
    
    // 기타 이미지 다운로드
    if (product.기타이미지URL && Array.isArray(product.기타이미지URL)) {
      for (const imageUrl of product.기타이미지URL) {
        try {
          const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
          const filename = `product_${imageCounter}${ext}`;
          const filepath = path.join(imgsDir, filename);
          await downloadImage(imageUrl, filepath);
          productImages.push(filepath);
          console.log(`이미지 다운로드 완료: ${filename}`);
          imageCounter++;
        } catch (error) {
          console.error(`기타 이미지 다운로드 실패: ${error.message}`);
        }
      }
    }
    
    // 로컬 이미지 경로는 메모리에만 유지하고 result.json에는 저장하지 않음
    // product.로컬이미지경로 = productImages;
  }
  
  console.log(`총 ${imageCounter - 1}개의 이미지 다운로드 완료`);
}

// 어필리에이트 URL 생성
async function createAffiliateUrl(productId, cookieString, spaceId) {
  try {
    // 1. OPTIONS 요청 (CORS preflight)
    await axios.options(
      'https://gw-brandconnect.naver.com/affiliate/command/affiliate-urls',
      {},
      {
        params: {
          'affiliateProductId': productId.toString(),
        },
        headers: {
          'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'access-control-request-headers': 'content-type,x-space-id',
          'access-control-request-method': 'POST',
          'origin': 'https://brandconnect.naver.com',
          'priority': 'u=1, i',
          'referer': `https://brandconnect.naver.com/${spaceId}/affiliate/products`,
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          'user-agent': getRandomUserAgent(),
          'cookie': cookieString
        }
      }
    ).catch(() => {}); // OPTIONS 요청 오류는 무시

    // 2. POST 요청으로 어필리에이트 URL 생성
    const postResponse = await axios.post(
      `https://gw-brandconnect.naver.com/affiliate/command/affiliate-urls?affiliateProductId=${productId}`,
      {},  // 빈 body
      {
        headers: {
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'content-type': 'application/json',
          'origin': 'https://brandconnect.naver.com',
          'priority': 'u=1, i',
          'referer': `https://brandconnect.naver.com/${spaceId}/affiliate/products`,
          'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          'user-agent': getRandomUserAgent(),
          'x-space-id': spaceId,
          'cookie': cookieString
        }
      }
    );

    if (postResponse.data && postResponse.data.url) {
      return postResponse.data.url;
    }
    return null;
  } catch (error) {
    console.error(`어필리에이트 URL 생성 실패 (ID: ${productId}):`, error.message);
    return null;
  }
}

// 데이터를 한글 키로 변환 및 어필리에이트 URL 추가
async function translateToKorean(data, cookieString, spaceId) {
  if (!data || !data.data) return { 상품목록: [] };
  
  // LIMIT이 100 미만인 경우 선택 방식에 따라 처리
  let products = data.data;
  if (LIMIT < 100 && products.length > LIMIT) {
    if (LIMIT_TYPE === 1) {
      // 랜덤 선택
      products = getRandomItems(products, LIMIT);
      console.log(`전체 ${data.data.length}개 중 랜덤으로 ${LIMIT}개 선택`);
    } else {
      // 순서대로 선택
      products = products.slice(0, LIMIT);
      console.log(`전체 ${data.data.length}개 중 순서대로 ${LIMIT}개 선택`);
    }
  }
  
  console.log('어필리에이트 URL 생성 중...');
  
  // 병렬로 어필리에이트 URL 생성
  const affiliateUrlPromises = products.map(product => 
    createAffiliateUrl(product.id, cookieString, spaceId)
  );
  const affiliateUrls = await Promise.all(affiliateUrlPromises);
  
  const translatedProducts = products.map((product, index) => ({
    상품ID: product.id,
    활성화여부: product.enabled,
    커미션율: product.commissionRate ? `${product.commissionRate}%` : null,
    프로모션커미션율: product.promotionCommissionRate ? `${product.promotionCommissionRate}%` : null,
    제휴스토어ID: product.affiliateStoreId,
    스토어명: product.storeName,
    브랜드스토어여부: product.brandStore,
    스토어상태: product.storeStatus,
    제휴스토어페널티: product.affiliateStorePenalty,
    상품명: product.productName,
    판매가격: product.salePrice ? `${formatNumber(product.salePrice)}원` : null,
    할인가격: product.discountedSalePrice ? `${formatNumber(product.discountedSalePrice)}원` : null,
    할인율: product.discountedRate ? `${product.discountedRate}%` : null,
    대표이미지URL: product.representativeProductImageUrl,
    기타이미지URL: product.otherProductImageUrls,
    상품URL: product.productUrl,
    상품설명URL: product.productDescriptionUrl,
    상품상태: product.productStatus,
    단축URL: product.shortenUrl,
    URL생성일: product.urlCreatedAt,
    프로모션: product.promotion,
    어필리에이트URL: affiliateUrls[index] || null
  }));
  
  const successCount = affiliateUrls.filter(url => url !== null).length;
  console.log(`어필리에이트 URL 생성 완료: ${successCount}/${products.length}개 성공`);
  
  // 이미지 다운로드
  await downloadAllImages(translatedProducts);
  
  return {
    카테고리: SELECTED_CATEGORY,
    카테고리ID: categoryIdMap[SELECTED_CATEGORY],
    크롤링일시: new Date().toISOString(),
    상품개수: translatedProducts.length,
    상품목록: translatedProducts
  };
}

// 메인 크롤링 함수
async function main() {
  const userId = process.env.SHOPPING_ID;
  const userPw = process.env.SHOPPING_PASSWORD;
  
  if (!userId) {
    console.log('환경변수에 SHOPPING_ID가 설정되지 않았습니다.');
    return;
  }

  // SELECTED_CATEGORY가 빈 값이면 랜덤 선택
  if (!SELECTED_CATEGORY) {
    const randomIndex = Math.floor(Math.random() * categories.length);
    SELECTED_CATEGORY = categories[randomIndex];
    console.log(`카테고리가 지정되지 않아 랜덤으로 선택: ${SELECTED_CATEGORY}`);
  }

  // 선택된 카테고리 확인 (문자열 또는 숫자 ID 지원)
  let categoryId;
  let categoryName;
  
  // 숫자인지 확인 (카테고리 ID가 직접 입력된 경우)
  if (/^\d+$/.test(SELECTED_CATEGORY)) {
    categoryId = SELECTED_CATEGORY;
    // ID로 카테고리명 찾기
    categoryName = Object.keys(categoryIdMap).find(key => categoryIdMap[key] === categoryId);
    if (!categoryName) {
      console.log(`잘못된 카테고리 ID입니다: ${SELECTED_CATEGORY}`);
      console.log('사용 가능한 카테고리 ID:', Object.values(categoryIdMap));
      return;
    }
    SELECTED_CATEGORY = categoryName; // 이후 사용을 위해 이름으로 변경
  } else {
    // 문자열로 입력된 경우 (기존 방식)
    categoryId = categoryIdMap[SELECTED_CATEGORY];
    categoryName = SELECTED_CATEGORY;
    if (!categoryId) {
      console.log(`잘못된 카테고리입니다: ${SELECTED_CATEGORY}`);
      console.log('사용 가능한 카테고리:', categories);
      console.log('또는 카테고리 ID 직접 입력 가능:', Object.values(categoryIdMap));
      return;
    }
  }

  console.log(`크롤링 설정:`);
  console.log(`- 카테고리: ${SELECTED_CATEGORY} (ID: ${categoryId})`);
  console.log(`- 아이디: ${userId}`);
  console.log(`- 제한: ${LIMIT}개`);
  
  try {
    // 로그인 데이터 가져오기 (쿠키 + space-id)
    let loginData = getLoginData(userId);
    
    // 쿠키가 없거나 space ID가 없는 경우 login-module 실행
    if (!loginData || !loginData.cookieString || !loginData.spaceId) {
      if (!loginData || !loginData.cookieString) {
        console.log("저장된 로그인 데이터가 없습니다.");
      } else {
        console.log("Space ID가 없습니다.");
      }
      
      if (!userPw) {
        console.log('환경변수에 SHOPPING_PASSWORD가 설정되지 않았습니다.');
        return;
      }
      
      console.log("login-module을 실행하여 로그인 및 Space ID를 가져옵니다...");
      const loginSuccess = await login(userId, userPw);
      
      if (!loginSuccess) {
        console.log("로그인에 실패했습니다.");
        return;
      }
      
      // 로그인 후 다시 데이터 로드
      loginData = getLoginData(userId);
      if (!loginData || !loginData.cookieString) {
        console.log("로그인 후에도 데이터를 가져올 수 없습니다.");
        return;
      }
    }
    
    const cookieString = loginData.cookieString;
    // cookies JSON에서 space-id 사용
    const spaceId = loginData.spaceId;
    
    if (!spaceId) {
      console.log('Space ID를 가져올 수 없습니다.');
      return;
    }
    
    console.log(`Space ID 사용: ${spaceId}`);
    
    console.log("쿠키 로드 완료, API 요청 시작...");
    
    let responseData;
    let retryCount = 0;
    const maxRetries = 1;
    
    while (retryCount <= maxRetries) {
      try {
        // API 요청으로 상품 데이터 가져오기
        responseData = await fetchProducts(categoryId, LIMIT, cookieString, spaceId);
        
        if(responseData.data) {
          break;
        }else{
          continue;
        }
        
      } catch (error) {
        if (error.code === 401 && retryCount < maxRetries) {
          console.log('\n⚠️ 401 인증 오류 발생. 쿠키를 삭제하고 재로그인을 시도합니다...');
          
          // 쿠키 파일 삭제
          const cookieFilePath = getCookieFilePath(userId);
          if (fs.existsSync(cookieFilePath)) {
            fs.unlinkSync(cookieFilePath);
            console.log('기존 쿠키 파일 삭제 완료');
          }
          
          // 비밀번호 확인
          if (!userPw) {
            console.log('환경변수에 SHOPPING_PASSWORD가 설정되지 않았습니다.');
            throw new Error('재로그인에 필요한 비밀번호가 없습니다.');
          }
          
          // 재로그인 시도
          console.log('재로그인 시도 중...');
          const loginSuccess = await login(userId, userPw);
          
          if (!loginSuccess) {
            throw new Error('재로그인에 실패했습니다.');
          }
          
          // 로그인 후 다시 데이터 로드
          loginData = getLoginData(userId);
          if (!loginData || !loginData.cookieString || !loginData.spaceId) {
            throw new Error('재로그인 후 데이터를 가져올 수 없습니다.');
          }
          
          cookieString = loginData.cookieString;
          spaceId = loginData.spaceId;
          
          console.log('재로그인 성공! 다시 API 요청을 시도합니다...');
          retryCount++;
          
        } else {
          throw error; // 401이 아니거나 재시도 횟수 초과 시 오류 전파
        }
      }
    }
    
    console.log(`API 응답 수신 완료: ${responseData.data ? responseData.data.length : 0}개 상품`);
    
    // 데이터를 한글 키로 변환 및 어필리에이트 URL 추가
    const translatedData = await translateToKorean(responseData, cookieString, spaceId);
    
    // 결과를 result.json에 저장
    fs.writeFileSync('result.json', JSON.stringify(translatedData, null, 2), 'utf8');
    console.log('크롤링 결과가 result.json에 저장되었습니다.');
    
    // 요약 정보 출력
    console.log('\n=== 크롤링 요약 ===');
    console.log(`카테고리: ${translatedData.카테고리}`);
    console.log(`크롤링 일시: ${translatedData.크롤링일시}`);
    console.log(`상품 개수: ${translatedData.상품개수}개`);
    
    if (translatedData.상품목록.length > 0) {
      console.log('\n첫 번째 상품 예시:');
      const firstProduct = translatedData.상품목록[0];
      console.log(`- 상품명: ${firstProduct.상품명}`);
      console.log(`- 스토어: ${firstProduct.스토어명}`);
      console.log(`- 판매가: ${firstProduct.판매가격}`);
      console.log(`- 할인가: ${firstProduct.할인가격} (${firstProduct.할인율} 할인)`);
      console.log(`- 커미션율: ${firstProduct.커미션율}`);
      console.log(`- 어필리에이트URL: ${firstProduct.어필리에이트URL || '생성 실패'}`);
    }
    
  } catch (error) {
    console.error("크롤링 중 에러 발생:", error.message);
  }
}

main();