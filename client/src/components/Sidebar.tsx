import React from 'react';
import { Nav } from 'react-bootstrap';
import { Requirement } from '../App'; // Import the Requirement type

interface SidebarProps {
  groupedRequirements: { [key: string]: { [key: string]: Requirement[] } };
  onBackToSelection: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ groupedRequirements, onBackToSelection }) => {
  const handleScrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Helper to get sorting key (number) from the first item
  const getCat1No = (subCategories: { [key: string]: Requirement[] }) => {
    const firstSub = Object.values(subCategories)[0];
    if (!firstSub || firstSub.length === 0) return 999;
    return parseInt(firstSub[0].category1_no, 10);
  };

  const getCat2No = (reqs: Requirement[]) => {
    if (!reqs || reqs.length === 0) return '';
    return reqs[0].category2_no;
  };

  // Sort Category 1
  const sortedCat1Entries = Object.entries(groupedRequirements).sort((a, b) => {
    return getCat1No(a[1]) - getCat1No(b[1]);
  });

  return (
    <div className="pt-3 pb-5" style={{ height: 'calc(100vh - 60px)', overflowY: 'auto' }}>
      <Nav className="flex-column">
        <Nav.Item>
          <Nav.Link onClick={() => handleScrollTo('progress-summary')} href="#progress-summary">
            進捗サマリー
          </Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link onClick={() => handleScrollTo('dashboard-section')} href="#dashboard-section">
            ダッシュボード
          </Nav.Link>
        </Nav.Item>
        <hr />
        {sortedCat1Entries.map(([category1, subCategories]) => {
            const firstReq = Object.values(subCategories)[0]?.[0];
            
            // Sort Category 2
            const sortedCat2Keys = Object.keys(subCategories).sort((a, b) => {
                const noA = getCat2No(subCategories[a]);
                const noB = getCat2No(subCategories[b]);
                // Use localeCompare with numeric option for natural sort (1-1, 1-2, 1-10)
                return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
            });

            return (
              <Nav.Item key={category1}>
                <Nav.Link 
                  onClick={() => handleScrollTo(`category-${category1.replaceAll('/', '-')}`)} 
                  href={`#category-${category1.replaceAll('/', '-')}`}
                  className="fw-bold text-wrap"
                  style={{ wordBreak: 'break-all' }}
                >
                  {firstReq?.category1_no}. {category1}
                </Nav.Link>
                <Nav className="flex-column ms-3">
                  {sortedCat2Keys.map((category2) => {
                    const cat2Req = subCategories[category2][0];
                    if (!cat2Req) return null;
                    return (
                    <Nav.Item key={category2}>
                       <Nav.Link 
                        onClick={() => handleScrollTo(`subcategory-${firstReq?.category1_no}-${cat2Req.category2_no}`)} 
                        href={`#subcategory-${firstReq?.category1_no}-${cat2Req.category2_no}`}
                        className="small text-wrap"
                        style={{ wordBreak: 'break-all' }}
                      >
                        {cat2Req.category2_no}. {category2}
                      </Nav.Link>
                    </Nav.Item>
                  )})}
                </Nav>
              </Nav.Item>
            );
        })}
      </Nav>
    </div>
  );
};

export default Sidebar;