'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';

interface Project {
  id: number;
  uuid: string;
  name: string;
  description: string;
  api_key: string;
}

interface ProjectContextType {
  activeProject: Project | null;
  setActiveProject: (project: Project | null) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('activeProject');
    if (saved) {
      try {
        setActiveProjectState(JSON.parse(saved));
      } catch (e) {
        localStorage.removeItem('activeProject');
      }
    }
  }, []);

  const setActiveProject = (project: Project | null) => {
    setActiveProjectState(project);
    if (project) {
      localStorage.setItem('activeProject', JSON.stringify(project));
    } else {
      localStorage.removeItem('activeProject');
    }
  };

  return (
    <ProjectContext.Provider value={{ activeProject, setActiveProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
