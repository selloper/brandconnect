const {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
  } = require("@google/generative-ai");
  const fs = require("node:fs");
  const path = require("path");
  require('dotenv').config();
  
  const raw = process.argv[2];
  const parsed = JSON.parse(raw);

  console.log('받은 geminiKeys:', parsed);


  const geminiKeys = parsed;
  
  const generationConfig = {
    temperature: 1,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
    responseModalities: [
    ],
    responseMimeType: "text/plain",
  };

  const rotateGeminiKeys = async (prompt) => {
    console.log("geminiKeys :", geminiKeys);
      
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
  
  async function run() {
    try {
      // result.json 파일 읽기
      const resultPath = path.join(__dirname, 'result.json');
      if (!fs.existsSync(resultPath)) {
        console.error('result.json 파일이 없습니다. 먼저 2.crawl.js를 실행해주세요.');
        return;
      }
      
      const resultData = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
      
      if (!resultData.상품목록 || resultData.상품목록.length === 0) {
        console.error('상품 목록이 비어있습니다.');
        return;
      }
      
      // 랜덤으로 상품 선택
      const randomIndex = Math.floor(Math.random() * resultData.상품목록.length);
      const selectedProduct = resultData.상품목록[randomIndex];
      
      console.log('선택된 상품:', selectedProduct.상품명);
      console.log('스토어:', selectedProduct.스토어명);
      console.log('판매가격:', selectedProduct.판매가격);
      console.log('할인가격:', selectedProduct.할인가격);
      console.log('할인율:', selectedProduct.할인율);
      console.log('');
      
      // Gemini에게 요청할 프롬프트 생성
      let productInfoText = `카테고리: ${resultData.카테고리}
스토어명: ${selectedProduct.스토어명}
상품명: ${selectedProduct.상품명}
판매가격: ${selectedProduct.판매가격}`;

      // 할인가격과 할인율이 있는 경우에만 추가
      if (selectedProduct.할인가격 && selectedProduct.할인가격 !== null && selectedProduct.할인가격 !== undefined && selectedProduct.할인가격 !== '') {
        productInfoText += `\n할인가격: ${selectedProduct.할인가격}`;
      }
      
      if (selectedProduct.할인율 && selectedProduct.할인율 !== null && selectedProduct.할인율 !== undefined && selectedProduct.할인율 !== '') {
        productInfoText += `\n할인율: ${selectedProduct.할인율}`;
      }

      const prompt = `You are a professional product reviewer who writes authentic and emotional product reviews based on personal experiences.

Using the following product information, write a comprehensive product review in Korean with a structured format. Focus ONLY on positive aspects and advantages. Write as if you personally purchased and used this product and had wonderful experiences. Include emotions, sensory details, and specific experiences that would make readers want to buy.

Product Information:
${productInfoText}

Requirements:
1. Return ONLY a valid JSON object in this exact format:
{
  "h1": "Creative and emotional main title that naturally includes the product name and its key benefit",
  "h3": "Warm personal greeting introducing your experience with the product and mentioning that discount information will be provided",
  "sections": [
    {
      "h2": "Creative subtitle about your first impression when unboxing or receiving the product",
      "p": "Personal and vivid description of unboxing experience and initial quality impressions"
    },
    {
      "h2": "Creative subtitle about the actual usage experience and performance",
      "p": "Detailed description of how the product performed during actual use"
    },
    {
      "h2": "Creative subtitle about specific features or advantages that stood out",
      "p": "In-depth explanation of the product's standout features and benefits"
    },
    {
      "h2": "Creative subtitle about quality and value for money",
      "p": "Assessment of build quality, materials, and overall value proposition"
    },
    {
      "h2": "Creative subtitle about comparison with expectations or previous products",
      "p": "How the product exceeded expectations or improved your daily life"
    },
    {
      "h2": "Creative subtitle about specific use cases or scenarios",
      "p": "Real-life examples of when and how the product is most useful"
    },
    {
      "h2": "Creative subtitle about customer service or shopping experience with the store",
      "p": "Positive experience with the store's service, shipping, or packaging"
    },
    {
      "h2": "Creative closing subtitle with final recommendation",
      "p": "Compelling final thoughts on why others should purchase this product"
    }
  ]
}

2. The h1 title MUST include the product name or its key feature
3. Write ALL content in Korean
4. Focus ONLY on positive aspects and advantages
5. Write from personal experience perspective with emotions and feelings
6. Include sensory details (what you saw, felt, experienced, etc.)
7. Make it engaging and persuasive
8. Do NOT use any emojis
9. h2 subtitles must be emotional and experiential - avoid stiff expressions
10. Make the content rich and detailed
11. Write as if you're a real customer who actually purchased and used the product
12. For better readability, include \n (backslash n) in p content to create line breaks where appropriate (but NOT in h1, h2, or h3)

Please return ONLY the JSON object, no additional text.`;
      
      const reviewText = await rotateGeminiKeys(prompt);
      console.log('reviewText ---> ', reviewText);
      
      try {
        // ```json과 ``` 제거
        reviewText = reviewText.replace(/```json\s*\n?/g, '').replace(/\n?```\s*$/g, '');
        
        // JSON 파싱 전에 제어 문자와 이스케이프 처리
        let fixedReviewText = reviewText
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // 제어 문자 제거 (탭, 줄바꿈, CR 제외)
          // 실제 줄바꿈을 먼저 이스케이프 처리
          .replace(/\r\n/g, '\\n')  // Windows 줄바꿈
          .replace(/\r/g, '\\n')     // Mac 줄바꿈
          .replace(/\n/g, '\\n')     // Unix 줄바꿈
          .replace(/\t/g, '\\t')     // 탭
          // 이중 백슬래시 처리 (\\n을 유지하면서 다른 불필요한 백슬래시 제거)
          .replace(/\\+n/g, '\\n')   // 여러 백슬래시+n을 하나의 \n으로
          .replace(/\\+t/g, '\\t')   // 여러 백슬래시+t를 하나의 \t로
          .replace(/\\+"/g, '\\"')   // 여러 백슬래시+"를 하나의 \"로
          .replace(/\\(?![nt"])/g, ''); // n, t, " 앞이 아닌 백슬래시는 제거
        
        // JSON 파싱 시도
        const reviewJson = JSON.parse(fixedReviewText);
        
        // 파싱 후 p 내용의 백슬래시와 줄바꿈 처리 (h1, h2, h3는 제외)
        if (reviewJson.sections && Array.isArray(reviewJson.sections)) {
          reviewJson.sections.forEach(section => {
            if (section.p) {
              // 여러 형태의 백슬래시+n을 실제 줄바꿈으로 변환
              section.p = section.p
                .replace(/\\+n/g, '\n')           // \n, \\n, \\\n 등을 모두 줄바꿈으로
                .replace(/\\\s+/g, '\n')          // 백슬래시+공백들을 줄바꿈으로
                .replace(/\n\s+/g, '\n')          // 줄바꿈 후 공백 제거
                .replace(/\s*\n\s*/g, '\n')       // 줄바꿈 전후 공백 제거
                .trim();                          // 앞뒤 공백 제거
            }
            if (section.h2) {
              // h2에서도 백슬래시 제거
              section.h2 = section.h2.replace(/\\/g, '');
            }
          });
        }
        
        // h1, h3에서도 백슬래시 제거
        if (reviewJson.h1) {
          reviewJson.h1 = reviewJson.h1.replace(/\\/g, '');
        }
        if (reviewJson.h3) {
          reviewJson.h3 = reviewJson.h3.replace(/\\/g, '');
        }
        
        console.log('\n=== 생성된 리뷰 구조 ===');
        console.log(`제목 (h1): ${reviewJson.h1}`);
        console.log(`인사말 (h3): ${reviewJson.h3}`);
        console.log('\n섹션별 내용:');
        let totalCharacters = reviewJson.h1.length + (reviewJson.h3 ? reviewJson.h3.length : 0);
        reviewJson.sections.forEach((section, index) => {
          console.log(`\n${index + 1}. ${section.h2}`);
          console.log(`   내용: ${section.p.substring(0, 50)}...`);
          totalCharacters += section.h2.length + section.p.length;
        });
        console.log(`\n전체 글자 수: ${totalCharacters}자`);
        console.log('====================\n');
        
        // result.json에 gemini 키로 저장 (구조화된 형태)
        resultData.gemini = reviewJson;
        resultData.gemini_content = fixedReviewText; // 수정된 텍스트도 보관
        resultData.선택된상품ID = selectedProduct.상품ID;
        resultData.선택된상품명 = selectedProduct.상품명;
        
      } catch (error) {
        console.error('JSON 파싱 오류:', error);
        console.log('파싱 오류 발생 - 대체 파싱 시도 중...');
        
        try {
          // 대체 파싱: 정규식으로 JSON 구조 추출 시도
          const h1Match = reviewText.match(/"h1"\s*:\s*"([^"]+)"/);
          const h3Match = reviewText.match(/"h3"\s*:\s*"([^"]+)"/);
          const sectionsMatch = reviewText.match(/"sections"\s*:\s*\[([\s\S]+)\]/);
          
          if (h1Match && sectionsMatch) {
            const sections = [];
            const sectionRegex = /\{\s*"h2"\s*:\s*"([^"]+)"\s*,\s*"p"\s*:\s*"([^"]+)"\s*\}/g;
            let match;
            
            while ((match = sectionRegex.exec(sectionsMatch[1])) !== null) {
              sections.push({
                h2: match[1],
                p: match[2].replace(/\\n/g, '\n')
              });
            }
            
            const reviewJson = {
              h1: h1Match[1],
              h3: h3Match ? h3Match[1] : '',
              sections: sections
            };
            
            console.log('\n=== 대체 파싱으로 생성된 리뷰 구조 ===');
            console.log(`제목 (h1): ${reviewJson.h1}`);
            console.log(`인사말 (h3): ${reviewJson.h3}`);
            console.log(`섹션 수: ${reviewJson.sections.length}`);
            console.log('====================\n');
            
            resultData.gemini = reviewJson;
            resultData.gemini_content = reviewText;
            resultData.선택된상품ID = selectedProduct.상품ID;
            resultData.선택된상품명 = selectedProduct.상품명;
          } else {
            throw new Error('대체 파싱도 실패');
          }
        } catch (altError) {
          console.error('대체 파싱도 실패:', altError.message);
          // 최종 실패 시 기본 구조 생성
          resultData.gemini_content = reviewText;
          resultData.선택된상품ID = selectedProduct.상품ID;
          resultData.선택된상품명 = selectedProduct.상품명;
          
          console.log('기본 리뷰 구조를 생성합니다...');
          resultData.gemini = {
            h1: `${selectedProduct.상품명} 사용 후기`,
            h3: `안녕하세요! ${selectedProduct.상품명}을 직접 사용해본 솔직한 후기를 들려드릴게요.`,
            sections: [
              {
                h2: "첫인상과 포장 상태",
                p: `${selectedProduct.스토어명}에서 구매한 ${selectedProduct.상품명}, 포장이 정말 꼼꼼하게 되어있어서 안심이 되었습니다.\n제품 상태도 완벽했고, 기대 이상의 퀄리티였어요.`
              },
              {
                h2: "실제 사용 경험",
                p: `직접 사용해보니 정말 만족스러웠습니다.\n${selectedProduct.할인율} 할인된 가격에 이런 품질이라니 정말 놀랐어요.`
              },
              {
                h2: "가격 대비 만족도",
                p: `${selectedProduct.판매가격}에서 ${selectedProduct.할인가격}으로 구매할 수 있어서 정말 좋았습니다.\n가성비 최고의 제품이라고 생각해요.`
              }
            ]
          };
        }
      }
      
      // result.json 파일에 저장
      fs.writeFileSync(resultPath, JSON.stringify(resultData, null, 2), 'utf8');
      console.log('result.json에 gemini 데이터가 저장되었습니다.');
      
    } catch (error) {
      console.error('오류 발생:', error.message);
    }
  }
  
  run();