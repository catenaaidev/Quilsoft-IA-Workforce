import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',use:{launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined},baseURL:'http://127.0.0.1:5173',viewport:{width:1280,height:800}},webServer:{command:'npm run dev',url:'http://127.0.0.1:5173',reuseExistingServer:true,timeout:30000}});
