import React, { useState, useEffect, useRef } from "react";
import { Upload, Card, Button, Input, Spin, Tabs, Table } from "antd";
import {SendOutlined, RobotOutlined } from "@ant-design/icons";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker?url";
import localforage from "localforage";
import "antd/dist/reset.css";
import "./App.css";

// PDF Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const { Dragger } = Upload;

// Validation Helpers
const validateEmail = (email: string) => /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(email);
const validatePhone = (phone: string) => /^\d{10}$/.test(phone);

// Questions in order
const questions = [
  { level: "Easy", time: 20, text: "Explain the difference between let, const, and var in JS." },
  { level: "Easy", time: 20, text: "What is JSX in React?" },
  { level: "Medium", time: 60, text: "Explain the lifecycle methods of a React component." },
  { level: "Medium", time: 60, text: "How does Node.js handle asynchronous operations?" },
  { level: "Hard", time: 120, text: "Design a REST API for a todo app using Node.js and Express." },
  { level: "Hard", time: 120, text: "Explain state management strategies in React for large applications." },
];

// Candidate Interface
interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  answers: string[];
  score?: number;
  summary?: string;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState("interviewee");
  const [messages, setMessages] = useState<{ sender: string; text: string }[]>([]);
  const [input, setInput] = useState("");
  // const [loading, setLoading] = useState(false);
  const [resumeData, setResumeData] = useState<{ name: string; email: string; phone: string; fullText: string }>({
    name: "",
    email: "",
    phone: "",
    fullText: "",
  });
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timer, setTimer] = useState(0);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const intervalRef = useRef<any>(null);
  const sessionId = useRef<string>(Math.random().toString(36).substring(2, 10));

  // Timer Effect (only runs for questions, not missing fields)
  useEffect(() => {
    if (
      currentQuestionIndex <= questions.length &&
      resumeData.name &&
      validateEmail(resumeData.email) &&
      validatePhone(resumeData.phone) &&
      timer > 0
    ) {
      intervalRef.current = setInterval(() => setTimer((prev) => prev - 1), 1000);
    } else if (timer === 0 && currentQuestionIndex <= questions.length && resumeData.name && validateEmail(resumeData.email) && validatePhone(resumeData.phone)) {
      handleNextQuestion("");
    }
    return () => clearInterval(intervalRef.current);
  }, [timer, currentQuestionIndex, resumeData]);

  // Resume Upload (PDF only)
  const handleResumeUpload = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf") {
      alert("Only PDF files are supported currently!");
      return false;
    }

    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let textContent = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const text = await page.getTextContent();
      textContent += text.items.map((s: any) => s.str).join(" ") + "\n";
    }

    const nameMatch = textContent.match(/Name[:\s]+([A-Za-z\s]+)/i);
    const emailMatch = textContent.match(/[a-zA-Z0-9._%+-]+@gmail\.com/);
    const phoneMatch = textContent.match(/\b\d{10}\b/);

    setResumeData({
      name: nameMatch ? nameMatch[1].trim() : "",
      email: emailMatch ? emailMatch[0] : "",
      phone: phoneMatch ? phoneMatch[0] : "",
      fullText: textContent,
    });

    alert("✅ Resume uploaded & parsed successfully!");
    return false; // prevent auto-upload
  };

  // Prompt for missing fields (no timer)
  useEffect(() => {
    if (!resumeData.name) askCandidate("Please enter your full name:");
    else if (!validateEmail(resumeData.email)) askCandidate("Please enter a valid Gmail address:");
    else if (!validatePhone(resumeData.phone)) askCandidate("Please enter your 10-digit phone number:");
    else if (currentQuestionIndex === 0 && messages.length === 0) {
      // Start first question automatically after fields filled
      setTimeout(() => handleNextQuestion(""), 500);
    }
  }, [resumeData]);

  const askCandidate = (text: string) => {
    setMessages([{ sender: "AI", text }]);
  };

  // Handle Candidate Input
  const handleSendMessage = () => {
    if (!input.trim()) return;

    const newMsg = { sender: "You", text: input };
    setMessages((prev) => [...prev, newMsg]);

    // Handle missing fields first (no timer)
    if (!resumeData.name) {
      setResumeData((prev) => ({ ...prev, name: input }));
      setInput("");
      return;
    } else if (!validateEmail(resumeData.email)) {
      if (!validateEmail(input)) return alert("Enter valid Gmail!");
      setResumeData((prev) => ({ ...prev, email: input }));
      setInput("");
      return;
    } else if (!validatePhone(resumeData.phone)) {
      if (!validatePhone(input)) return alert("Enter valid 10-digit phone!");
      setResumeData((prev) => ({ ...prev, phone: input }));
      setInput("");
      return;
    }

    // Handle question-answer flow (with timer)
    handleNextQuestion(input);
    setInput("");
  };

  const handleNextQuestion = (answer: string) => {
    // Save answer
    if (currentQuestionIndex > 0) {
      const updatedCandidates = [...candidates];
      const candidate = updatedCandidates.find((c) => c.id === sessionId.current);
      if (!candidate) {
        updatedCandidates.push({
          id: sessionId.current,
          name: resumeData.name,
          email: resumeData.email,
          phone: resumeData.phone,
          answers: [answer],
        });
      } else {
        candidate.answers.push(answer);
      }
      setCandidates(updatedCandidates);
      localforage.setItem("candidates", updatedCandidates); // persist only after finishing questions
    }

    // Move to next question
    if (currentQuestionIndex < questions.length) {
      const q = questions[currentQuestionIndex];
      setMessages((prev) => [...prev, { sender: "AI", text: q.text }]);
      setTimer(q.time); // start timer for question
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      finishInterview();
    }
  };

  const finishInterview = () => {
    const updatedCandidates = candidates.map((c) =>
      c.id === sessionId.current
        ? {
            ...c,
            score: Math.floor(Math.random() * 100),
            summary: "Candidate shows good knowledge in React/Node.js",
          }
        : c
    );
    setCandidates(updatedCandidates);
    localforage.setItem("candidates", updatedCandidates); // persist after finishing
    setMessages((prev) => [...prev, { sender: "AI", text: "✅ Interview finished!" }]);
    setTimer(0);
    setCurrentQuestionIndex(questions.length + 1);
  };

  // Interviewer Table
  const columns = [
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Email", dataIndex: "email", key: "email" },
    { title: "Phone", dataIndex: "phone", key: "phone" },
    { title: "Score", dataIndex: "score", key: "score" },
    { title: "Summary", dataIndex: "summary", key: "summary" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-r from-gray-100 to-gray-200 flex flex-col items-center justify-center p-6">
      <Card
        className="w-full max-w-5xl shadow-xl rounded-2xl p-6 bg-white"
        title={
          <div className="flex items-center space-x-2">
            <RobotOutlined className="text-blue-500 text-xl" />
            <span className="text-lg font-semibold">AI Interview Assistant</span>
          </div>
        }
      >
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <Tabs.TabPane tab="Interviewee" key="interviewee">
            <div className="flex justify-center mb-4">
              <Dragger
                name="resume"
                accept=".pdf"
                beforeUpload={handleResumeUpload}
                className="w-full max-w-md"
              >
                <p className="ant-upload-drag-icon">📄</p>
                <p className="ant-upload-text font-medium">Click or drag resume (PDF) to upload</p>
              </Dragger>
            </div>

            <div className="h-72 overflow-y-auto border rounded-lg p-4 mb-4 bg-gray-50">
              {messages.map((msg, idx) => (
                <div key={idx} className={`mb-2 ${msg.sender === "You" ? "text-right" : "text-left"}`}>
                  <span
                    className={`inline-block px-3 py-2 rounded-lg ${
                      msg.sender === "You" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-900"
                    }`}
                  >
                    <strong>{msg.sender}:</strong> {msg.text}
                  </span>
                </div>
              ))}
              {loading && (
                <div className="flex justify-center mt-2">
                  <Spin />
                </div>
              )}
            </div>

            <div className="flex space-x-2 mb-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPressEnter={handleSendMessage}
                placeholder="Type your message..."
                className="rounded-lg"
              />
              <Button type="primary" icon={<SendOutlined />} onClick={handleSendMessage} disabled={loading}>
                Send
              </Button>
            </div>

            {currentQuestionIndex <= questions.length &&
              resumeData.name &&
              validateEmail(resumeData.email) &&
              validatePhone(resumeData.phone) &&
              timer > 0 && (
                <div className="text-center text-gray-700">Time left: {timer}s</div>
              )}
          </Tabs.TabPane>

          <Tabs.TabPane tab="Interviewer Dashboard" key="interviewer">
            <Table columns={columns} dataSource={candidates} rowKey="id" />
          </Tabs.TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default App;
