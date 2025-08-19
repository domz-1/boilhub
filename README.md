i have this idea "" boilerplate hub
 maker with my syntax what packages to download what is the setupt ?! all of these an open source developer can make its own biblouther with one json files contains commands, steps, questions, types, all lf that and i make a package can run the command and bring a spifif one and parse it with my standards and running it from the json file also want to make documentation and community for people to add there own boilerplate You can make a fork from an application on github and change the name of project and update all packages and make the app have dummy data Or Tree to. Project converter Or you can make questions and steps and conditions and specific files to edit and content of file validation"" and i made this syntax of yamel to make the stpes ""# yaml-language-server: $schema=https://boilhub.dev/schema/v2.yaml
meta:
  id: react-ts-ultimate-pro
  name: React TS Ultimate Pro
  version: 5.2.0
  author: YourName
  description: Advanced React + TypeScript boilerplate with AI-assisted workflows
  tags:
    - react
    - typescript
    - vite
    - ai-ready
  repo: https://github.com/yourname/react-ts-pro
  compatibility:
    node: ">=20.0.0"
    system: linux|mac|win
  community:
    contributors:
      - "@user1"
      - "@user2"
config:
  variables:
    project_name: my-app
    ui_framework: none
    state_manager: none
    use_ai: false
    deployment: none
  prompts:
    - type: text
      name: project_name
      message: "🚀 Project name:"
      validate:
        regex: ^[a-z0-9-]{3,20}$
        error: Lowercase alphanumeric with hyphens (3-20 chars)
    - type: select
      name: ui_framework
      message: "🌈 UI Framework:"
      options:
        - label: None
          value: none
        - label: Shadcn UI (Modern)
          value: shadcn
          dependencies:
            - @shadcn/ui
            - tailwindcss
    - type: confirm
      name: use_ai
      message: "🤖 Add AI capabilities?"
      description: Integrates OpenAI SDK and AI hooks
workflow:
phases:
  - name: core-setup
    title: "🚀 Core Setup"
    description: "Setting up the core project structure with Vite and React TypeScript"
    steps:
      - id: create-vite
        title: "Create Vite Project"
        description: "Initialize a new Vite project with React TypeScript template"
        type: command
        cmd: npm create vite@latest {{project_name}} -- --template react-ts
        haveInteraction: true
        interactions:
          - question: Ok to proceed?
            answer: y
          - question: Select framework:
            answer: React
        validate:
          path: "{{project_name}}/package.json"
          test: exists
  - name: file-ops
    title: "📁 File Operations"
    description: "Performing file structure setup and modifications"
    steps:
      - id: create-dirs
        title: "Create Essential Directories"
        description: "Setting up hooks, lib, and providers directories"
        type: directory
        action: create
        paths:
          - "{{project_name}}/src/hooks"
          - "{{project_name}}/src/lib"
          - "{{project_name}}/src/providers"
      - id: transform-app
        title: "Create App Component"
        description: "Setting up the main App component with AI provider structure"
        type: file
        action: create
        path: "{{project_name}}/src/App.tsx"
        content: |
          import React from 'react';
          import { useAI } from './hooks/useAI';
          import { AIProvider } from './providers/AIProvider';
          import { AI } from './lib/AI';
          const App = () => {
            const { ai } = useAI();
            return (
              <AIProvider>
                <AI />
              </AIProvider>
            );
          };
          export default App;
      - id: transform-main-edit
        title: "Edit Main Entry File"
        description: "Preparing main.tsx for transformation with necessary imports"
        type: file
        action: edit
        path: "{{project_name}}/src/main.tsx"
        content: |
          @import React from 'react';
          @import ReactDOM from 'react-dom';
          @import App from './App';
          {{file-content}}
      - id: transform-main-delete
        title: "Remove Original Main File"
        description: "Cleaning up the original main.tsx before moving"
        type: file
        action: delete
        path: "{{project_name}}/src/main.tsx"
      - id: transform-main-move
        title: "Rename Main Entry File"
        description: "Moving main.tsx to index.tsx as standard entry point"
        type: file
        action: move
        path:
          from: "{{project_name}}/src/main.tsx"
          to: "{{project_name}}/src/index.tsx"
        
afterPhases:
  massage: |
        Your Projet is ininlizes and run npm run build 

"" use nodes to ma e ascript taking the yamel file and doing all the operation but be careful
        the command make it clear dont show but the pase title ot the step ttile whats prociign and whats done also want to use inquirer to amke the questions use spawn to run the commanss of cmd and to anwer the questions , if you run a command in astep and the command have answers and the question not having answer in the yamel intercative of this command append it to the user to be able to answer it and if it has answer use spawn to answer it aoutomicly usedo the file operations if create make the whle file content and the edit is like the post must making a ll the file content like the content in yamel do not edit a part of the file only > delete and move : the move has two paths move teh content from this file to this file and if the new file not fond make it and delete the old file