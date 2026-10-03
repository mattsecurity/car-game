import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',timeout:90000,workers:1,use:{baseURL:'http://localhost:5175',viewport:{width:1440,height:900},headless:true,launchOptions:{args:['--use-angle=metal']}},webServer:{command:'npm run dev -- --port 5175 --strictPort',url:'http://localhost:5175',reuseExistingServer:true},reporter:'list'});
