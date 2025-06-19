document.addEventListener('DOMContentLoaded', () => {
    const testSelector = document.getElementById('testSelector');
    const startTestButton = document.getElementById('startTestButton');
    const quizArea = document.getElementById('quiz-area');
    const quizForm = document.getElementById('quizForm');
    const quizTitleEl = document.getElementById('quizTitle');
    const quizDescriptionEl = document.getElementById('quizDescription');
    const submitQuizButton = document.getElementById('submitQuizButton');
    const resultsContainer = document.getElementById('results-container');
    const scoreDisplay = document.getElementById('score-display');
    const detailedAnswersDiv = document.getElementById('detailed-answers');
    const resetCurrentTestButton = document.getElementById('resetCurrentTestButton');
    const resetFullAppButton = document.getElementById('resetFullAppButton');
    const testSelectorContainer = document.getElementById('test-selector-container');


    let testsManifest = [];
    let currentTestData = null;
    let correctlyAnsweredInSession = {}; // { qId: true/false }
    let currentTestTotalScore = 0;

    // --- 1. Загрузка манифеста тестов ---
    async function loadTestsManifest() {
        try {
            const response = await fetch('data/manifest.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const manifest = await response.json();
            testsManifest = manifest.tests;
            populateTestSelector();
        } catch (error) {
            console.error("Не удалось загрузить манифест тестов:", error);
            testSelector.innerHTML = '<option value="">Ошибка загрузки тестов</option>';
        }
    }

    // --- 2. Заполнение выпадающего списка тестов ---
    function populateTestSelector() {
        if (testsManifest.length === 0) {
            testSelector.innerHTML = '<option value="">Нет доступных тестов</option>';
            return;
        }
        testSelector.innerHTML = '<option value="">-- Выберите тест --</option>'; // Сброс
        testsManifest.forEach(test => {
            const option = document.createElement('option');
            option.value = test.id;
            option.textContent = test.title;
            testSelector.appendChild(option);
        });
        testSelector.disabled = false;
        startTestButton.disabled = true; // Кнопка старта активна после выбора
    }

    testSelector.addEventListener('change', () => {
        startTestButton.disabled = !testSelector.value;
    });

    startTestButton.addEventListener('click', async () => {
        const selectedTestId = testSelector.value;
        if (!selectedTestId) return;

        const testMeta = testsManifest.find(t => t.id === selectedTestId);
        if (!testMeta) return;

        try {
            const response = await fetch(testMeta.filePath);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            currentTestData = await response.json();
            initializeQuiz();
        } catch (error) {
            console.error(`Не удалось загрузить тест "${testMeta.title}":`, error);
            alert(`Ошибка загрузки теста: ${testMeta.title}`);
        }
    });

    // --- 3. Инициализация и рендеринг выбранного теста ---
    function initializeQuiz() {
        testSelectorContainer.style.display = 'none';
        quizArea.style.display = 'block';
        resultsContainer.style.display = 'none';
        resetFullAppButton.style.display = 'none';
        resetCurrentTestButton.style.display = 'none';
        submitQuizButton.style.display = 'block';
        submitQuizButton.textContent = "Проверить результаты";


        quizTitleEl.textContent = currentTestData.title;
        quizDescriptionEl.textContent = currentTestData.description || "";
        quizForm.innerHTML = ''; // Очистить предыдущий тест
        correctlyAnsweredInSession = {};
        currentTestTotalScore = 0;

        currentTestData.content.forEach((contentBlock, blockIndex) => {
            const blockDiv = document.createElement('div');
            blockDiv.className = 'text-section'; // Используем существующий класс

            if (contentBlock.hebrewText) {
                const hebrewTextDiv = document.createElement('div');
                hebrewTextDiv.className = 'hebrew-text';
                hebrewTextDiv.innerHTML = contentBlock.hebrewText.replace(/\n/g, '<br>'); // Поддержка переносов строк
                blockDiv.appendChild(hebrewTextDiv);
            }

            if (contentBlock.vocabulary && contentBlock.vocabulary.length > 0) {
                const vocabDetails = document.createElement('details');
                const vocabSummary = document.createElement('summary');
                vocabSummary.textContent = 'Словарик:';
                vocabDetails.appendChild(vocabSummary);
                const vocabUl = document.createElement('ul');
                contentBlock.vocabulary.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = `${item.term} - ${item.translation}`;
                    vocabUl.appendChild(li);
                });
                vocabDetails.appendChild(vocabUl);
                const vocabDiv = document.createElement('div');
                vocabDiv.className = 'vocabulary';
                vocabDiv.appendChild(vocabDetails);
                blockDiv.appendChild(vocabDiv);
            }

            const questionsDiv = document.createElement('div');
            questionsDiv.className = 'questions';
            contentBlock.questions.forEach((question, qIndex) => {
                const questionDiv = document.createElement('div');
                questionDiv.className = 'question';
                const questionIdFull = `${contentBlock.textId}_${question.id}`; // Уникальный ID для name

                const p = document.createElement('p');
                p.textContent = `${qIndex + 1}. ${question.text}`;
                questionDiv.appendChild(p);

                const optionsDiv = document.createElement('div');
                optionsDiv.className = 'options';
                for (const key in question.options) {
                    const label = document.createElement('label');
                    const input = document.createElement('input');
                    input.type = 'radio';
                    input.name = questionIdFull; 
                    input.value = key;
                    label.appendChild(input);
                    const span = document.createElement('span');
                    span.textContent = ` ${question.options[key]}`;
                    label.appendChild(span);
                    optionsDiv.appendChild(label);
                }
                questionDiv.appendChild(optionsDiv);
                const feedbackDiv = document.createElement('div');
                feedbackDiv.className = 'feedback';
                feedbackDiv.id = `feedback-${questionIdFull}`;
                questionDiv.appendChild(feedbackDiv);
                questionsDiv.appendChild(questionDiv);
            });
            blockDiv.appendChild(questionsDiv);
            quizForm.appendChild(blockDiv);
        });
    }
    
    // --- 4. Проверка ответов ---
    submitQuizButton.addEventListener('click', () => {
        if (!currentTestData) return;

        currentTestTotalScore = 0; // Пересчитываем только активные или новые правильные ответы
        let allQuestionsAnsweredCorrectlyOrLocked = true;

        currentTestData.content.forEach(contentBlock => {
            contentBlock.questions.forEach(question => {
                const questionIdFull = `${contentBlock.textId}_${question.id}`;
                const feedbackEl = document.getElementById(`feedback-${questionIdFull}`);
                const radioGroup = quizForm.elements[questionIdFull];
                
                // Если вопрос уже был правильно отвечен и заблокирован в этой сессии
                if (correctlyAnsweredInSession[questionIdFull] === true) {
                    currentTestTotalScore += currentTestData.pointsPerQuestion || 8;
                    // feedbackEl и radio уже должны быть в правильном состоянии
                    return; // Переходим к следующему вопросу
                }

                allQuestionsAnsweredCorrectlyOrLocked = false; // Есть хотя бы один активный вопрос

                const userAnswer = radioGroup ? radioGroup.value : "";

                if (userAnswer) {
                    if (userAnswer === question.correctAnswer) {
                        currentTestTotalScore += currentTestData.pointsPerQuestion || 8;
                        correctlyAnsweredInSession[questionIdFull] = true;
                        feedbackEl.textContent = 'Верно!';
                        feedbackEl.className = 'feedback correct';
                    } else {
                        correctlyAnsweredInSession[questionIdFull] = false;
                        feedbackEl.textContent = 'Неверно.';
                        feedbackEl.className = 'feedback incorrect';
                    }
                } else {
                    correctlyAnsweredInSession[questionIdFull] = false;
                    feedbackEl.textContent = 'Нет ответа.';
                    feedbackEl.className = 'feedback unanswered';
                }
            });
        });

        displayResults();
    });

    // --- 5. Отображение результатов ---
    function displayResults() {
        const totalPossibleScore = currentTestData.content.reduce((sum, block) => sum + block.questions.length, 0) * (currentTestData.pointsPerQuestion || 8);
        scoreDisplay.textContent = `Вы набрали: ${currentTestTotalScore} из ${totalPossibleScore} баллов.`;
        resultsContainer.style.display = 'block';
        
        const threshold = currentTestData.secretWordThreshold || 100;
        const secret = currentTestData.secretWord || "потолок";

        if (currentTestTotalScore > threshold) {
            scoreDisplay.innerHTML += `<br><strong style="color:green; font-size:1.2em;">Поздравляем! Ваше секретное слово: ${secret}</strong>`;
            detailedAnswersDiv.innerHTML = generateDetailedReport(true); // Показать все ответы и объяснения
            
            // Блокируем все вопросы окончательно
            lockAllQuestions(true);
            submitQuizButton.style.display = 'none';
            resetCurrentTestButton.style.display = 'none'; // Уже не нужен
            resetFullAppButton.style.display = 'block'; // Предложить выбрать другой тест

        } else {
            scoreDisplay.innerHTML += `<br><span style="color:red;">Попробуйте еще раз улучшить результат!</span>`;
            detailedAnswersDiv.innerHTML = generateDetailedReport(false); // Не раскрывать правильные для неверных/пропущенных
            
            // Обновить состояние формы для следующей попытки по этому тесту
            updateFormForRetry();
            submitQuizButton.textContent = "Проверить исправленные ответы";
            submitQuizButton.style.display = 'block';
            resetCurrentTestButton.style.display = 'block';
            resetFullAppButton.style.display = 'block';
        }
    }

    function generateDetailedReport(showAllCorrectAnswers) {
        let reportHtml = '<h3>Детализация ответов:</h3><ol>';
        currentTestData.content.forEach(contentBlock => {
            contentBlock.questions.forEach((question, qIndex) => {
                const questionIdFull = `${contentBlock.textId}_${question.id}`;
                const radioGroup = quizForm.elements[questionIdFull];
                const userAnswer = radioGroup ? radioGroup.value : "";
                const isCorrect = correctlyAnsweredInSession[questionIdFull];
                const displayText = question.options[userAnswer] || "Нет ответа";
                const correctAnswerText = question.options[question.correctAnswer];

                reportHtml += `<li>Вопрос ${qIndex + 1} (${question.text.substring(0,30)}...): `;
                if (isCorrect) {
                    reportHtml += `<span class="correct">Верно.</span> Ваш ответ: "${correctAnswerText}".`;
                    if (showAllCorrectAnswers && question.explanation) reportHtml += ` (${question.explanation})`;
                } else if (userAnswer) { // Неверный ответ
                    reportHtml += `<span class="incorrect">Неверно.</span> Ваш ответ был: "${displayText}".`;
                    if (showAllCorrectAnswers) {
                         reportHtml += ` Правильный: "${correctAnswerText}".`;
                         if (question.explanation) reportHtml += ` (${question.explanation})`;
                    }
                } else { // Не отвечен
                    reportHtml += `<span class="unanswered">Нет ответа.</span>`;
                    if (showAllCorrectAnswers) {
                        reportHtml += ` Правильный ответ: "${correctAnswerText}".`;
                        if (question.explanation) reportHtml += ` (${question.explanation})`;
                    }
                }
                reportHtml += `</li>`;
            });
        });
        reportHtml += '</ol>';
        return reportHtml;
    }

    function lockAllQuestions(isFinalLock) {
         currentTestData.content.forEach(contentBlock => {
            contentBlock.questions.forEach(question => {
                const questionIdFull = `${contentBlock.textId}_${question.id}`;
                const radioGroup = quizForm.elements[questionIdFull];
                if (radioGroup) {
                    for (const radio of radioGroup) {
                        radio.disabled = true;
                        // Если финальная блокировка и ответ верный, убедимся что он выбран
                        if (isFinalLock && correctlyAnsweredInSession[questionIdFull] && radio.value === question.correctAnswer) {
                            radio.checked = true;
                        }
                    }
                }
            });
        });
    }

    function updateFormForRetry() {
        currentTestData.content.forEach(contentBlock => {
            contentBlock.questions.forEach(question => {
                const questionIdFull = `${contentBlock.textId}_${question.id}`;
                const radioGroup = quizForm.elements[questionIdFull];
                const feedbackEl = document.getElementById(`feedback-${questionIdFull}`);

                if (radioGroup) {
                    for (const radio of radioGroup) {
                        if (correctlyAnsweredInSession[questionIdFull] === true) {
                            radio.disabled = true; // Блокируем правильно отвеченные
                            if (radio.value === question.correctAnswer) radio.checked = true; // Оставляем выбранным
                        } else {
                            radio.disabled = false; // Разблокируем неверные/пропущенные
                            radio.checked = false;  // Сбрасываем выбор
                        }
                    }
                }
                // Очищаем или обновляем фидбек для активных вопросов
                if(correctlyAnsweredInSession[questionIdFull] !== true) {
                    feedbackEl.textContent = '';
                    feedbackEl.className = 'feedback';
                }
            });
        });
    }

    // --- 6. Сброс текущего теста для повторной попытки (не полный сброс приложения) ---
    resetCurrentTestButton.addEventListener('click', () => {
        // Сбросить только неверно отвеченные, оставить правильно отвеченные заблокированными
        updateFormForRetry(); // Эта функция уже делает то, что нужно для "попробовать снова"
        resultsContainer.style.display = 'none'; // Скрыть старые результаты
        detailedAnswersDiv.innerHTML = '';
        submitQuizButton.textContent = "Проверить результаты";
        resetCurrentTestButton.style.display = 'none'; // Скрыть кнопку "попробовать этот тест снова", пока не будет новой проверки
    });


    // --- 7. Полный сброс приложения для выбора нового теста ---
    resetFullAppButton.addEventListener('click', () => {
        currentTestData = null;
        correctlyAnsweredInSession = {};
        currentTestTotalScore = 0;
        
        quizArea.style.display = 'none';
        resultsContainer.style.display = 'none';
        testSelectorContainer.style.display = 'block';
        resetFullAppButton.style.display = 'none';
        resetCurrentTestButton.style.display = 'none';


        testSelector.value = ""; // Сбросить выбор
        startTestButton.disabled = true; // Деактивировать кнопку старта
        populateTestSelector(); // Перезаполнить на случай, если манифест изменился (хотя тут он статический)
    });


    // --- Начальная загрузка ---
    loadTestsManifest();
});